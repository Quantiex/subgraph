import { BigInt, Address, Bytes, store, log } from '@graphprotocol/graph-ts'
import { LOG_CALL, LOG_JOIN, LOG_EXIT, LOG_SWAP, Transfer, GulpCall } from '../types/templates/Pool/Pool'
import { Pool as BPool } from '../types/templates/Pool/Pool'
import {
  Tidalx,
  Pool,
  PoolToken,
  PoolShare,
  Swap,
  User
} from '../types/schema'
import {
  hexToDecimal,
  bigIntToDecimal,
  tokenToDecimal,
  createPoolShareEntity,
  createPoolTokenEntity,
  updatePoolLiquidity,
  getCrpUnderlyingPool,
  saveTransaction,
  ZERO_BD,
  decrPoolCount,
  createUserEntity,
  normalizeUserAddress
} from './helpers'
import { 
  ConfigurableRightsPool, 
  OwnershipTransferred, 
  Transfer as SmartPoolTransfer, 
  LogJoin, 
  LogExit,
  LogCall,
  CapChanged
} from '../types/Factory/ConfigurableRightsPool'

/************************************
 ********** Pool Controls ***********
 ************************************/

export function handleSetSwapFee(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)!
  if(pool != null) {
    let swapFee = hexToDecimal(event.params.data.toHexString().slice(-40), 18)
    pool.swapFee = swapFee
    pool.save()

    saveTransaction(event, 'setSwapFee')
  }
}

export function handleSetController(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)

  if (pool != null) {
   
    let controller = Address.fromString(event.params.data.toHexString().slice(-40))
    pool.controller = controller
    pool.save()

    saveTransaction(event, 'setController')
  }
}

export function handleSetCrpController(event: OwnershipTransferred): void {
  // This event occurs on the CRP contract rather than the underlying pool so we must perform a lookup.
  let crp = ConfigurableRightsPool.bind(event.address)
  let pool = Pool.load(getCrpUnderlyingPool(crp)!)!

  if(pool != null) {

    pool.crpController = normalizeUserAddress(event.params.newOwner)
    pool.save()

    // We overwrite event address so that ownership transfers can be linked to Pool entities for above reason.
    event.address = Address.fromString(pool.id)
    saveTransaction(event, 'setCrpController')
  }
}

export function handleCapChanged(event: CapChanged): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolIdMaybe = getCrpUnderlyingPool(crp)
  if (poolIdMaybe == null) return
  let poolId = poolIdMaybe as string
  let pool = Pool.load(poolId)
  if (pool == null) return
  pool.cap = event.params.newCap
  pool.save()
}

export function handleSetManagerFee(event: LogCall): void {
  event
}

export function handleSetPublicSwap(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)
  if(pool != null) {
    let publicSwap = event.params.data.toHexString().slice(-1) == '1'
    pool.publicSwap = publicSwap
    pool.save()

    saveTransaction(event, 'setPublicSwap')
  }
}

export function handleFinalize(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)!
  if(pool != null) {

    pool.finalized = true
    pool.symbol = 'DPT'
    pool.publicSwap = true
    
    let bpool = BPool.bind(Address.fromString(poolId))
    let totalSupplyCall = bpool.try_totalSupply()
    let balance = ZERO_BD
    if (!totalSupplyCall.reverted) {
      balance = bigIntToDecimal(totalSupplyCall.value, 18)
    }

    pool.totalShares = balance
    pool.save()

    let controller = event.params.caller.toHex()
    let poolShareId = poolId.concat('-').concat(controller)
    let poolShare = PoolShare.load(poolShareId)
    if (poolShare == null) {
      createPoolShareEntity(poolShareId, poolId, controller)
      poolShare = PoolShare.load(poolShareId)
    }
    if (poolShare != null) {
      poolShare.balance = balance
      poolShare.userBalance = balance
      poolShare.save()
    }

    let factory = Tidalx.load('1')
    if(factory == null) return
    factory.finalizedPoolCount = factory.finalizedPoolCount + 1
    factory.save()

    saveTransaction(event, 'finalize')
  }
}

/*
  address tokenA sell, 
  address tokenB buy,
  uint deltaWeight, 
  uint deltaBalance,
  bool isSoldout == true,oversell
  uint minAmountOut
*/

export function handleRebindSmart(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)!
  if(pool != null) {
    let tokenBytesA = Bytes.fromHexString(event.params.data.toHexString().slice(34,74)) as Bytes
    let tokenBytes = Bytes.fromHexString(event.params.data.toHexString().slice(98,138)) as Bytes
    let isSoldout = (event.params.data.toHexString().slice(266,330)).slice(63)
  
    let tokensList = pool.tokensList || []
    let isSoldoutFlag = isSoldout == '0' ? false : true 

    if(isSoldoutFlag) {
      let index = tokensList.indexOf(tokenBytesA)
      tokensList.splice(index, 1)
      
      if (tokensList.indexOf(tokenBytes) == -1 ) {
        tokensList.push(tokenBytes)
      }
      pool.tokensList = tokensList
      pool.tokensCount = BigInt.fromI32(tokensList.length)
      pool.save()
    }else {
      
      if (tokensList.indexOf(tokenBytes) == -1 ) {
        tokensList.push(tokenBytes)
      }

      pool.tokensList = tokensList
      pool.tokensCount = BigInt.fromI32(tokensList.length)
      pool.save()
    }
    
    let denormWeight = hexToDecimal(event.params.data.toHexString().slice(138, 202), 18) // deltaWeight

    let addressA = Address.fromString(event.params.data.toHexString().slice(34,74))
    let poolTokenAId = poolId.concat('-').concat(addressA.toHexString())
    let poolTokenA = PoolToken.load(poolTokenAId)

    let bpool = BPool.bind(Address.fromString(poolId))

    if(poolTokenA != null) {

      let balanceCall = bpool.try_getBalance(addressA)

      poolTokenA.denormWeight = poolTokenA.denormWeight.minus(denormWeight)
      let balanceA = ZERO_BD
      if (!balanceCall.reverted) {
        balanceA = bigIntToDecimal(balanceCall.value, poolTokenA.decimals)
      }
      poolTokenA.balance = balanceA
      poolTokenA.save()

    }

    let addressB = Address.fromString(event.params.data.toHexString().slice(98,138))
    let poolTokenBId = poolId.concat('-').concat(addressB.toHexString())
    let poolTokenB = PoolToken.load(poolTokenBId)
    let createdB = false
    if (poolTokenB == null) {
      createPoolTokenEntity(poolTokenBId, poolId, addressB.toHexString())
      poolTokenB = PoolToken.load(poolTokenBId)
      createdB = true
    }
    if(poolTokenB != null) {
      let balanceBCall = bpool.try_getBalance(addressB)
      let balanceB = ZERO_BD
      if (!balanceBCall.reverted) {
        balanceB = bigIntToDecimal(balanceBCall.value, poolTokenB.decimals)
      }
      poolTokenB.balance = balanceB
      if (createdB) {
        poolTokenB.denormWeight = denormWeight
      } else {
        poolTokenB.denormWeight = poolTokenB.denormWeight.plus(denormWeight)
      }
      poolTokenB.save()
    }

    if(poolTokenA && poolTokenA.denormWeight.equals(ZERO_BD)){
      store.remove('PoolToken', poolTokenAId)
    }

    pool.save()
    updatePoolLiquidity(poolId)
    saveTransaction(event, 'rebindSmart')
  }
}

/// @notice Event emited after rebalancing
/// @param token0 The token to sell
/// @param token1 The token to buy
/// @param newWeight0 New weight of token0
/// @param newWeight1 New weight of token1
/// @param newBalance0 New balance of token0
/// @param newBalance1 New balance of token1
/// @param isSoldOut Is sold out token0

export function handleRebalanceExcute(event: LOG_CALL): void {
  event
}

export function handleRebalanced(event: LOG_CALL): void {
  // This handler is not wired in `subgraph.yaml` in this repo.
  // It remains as a no-op to avoid build failures from stale imports.
  event
}

export function handleRebind(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)!

  let tokenBytes = Bytes.fromHexString(event.params.data.toHexString().slice(34,74)) as Bytes
  let tokensList = pool.tokensList || []
  if (tokensList.indexOf(tokenBytes) == -1 ) {
    tokensList.push(tokenBytes)
  }
  pool.tokensList = tokensList
  pool.tokensCount = BigInt.fromI32(tokensList.length)

  let address = Address.fromString(event.params.data.toHexString().slice(34,74))
  let denormWeight = hexToDecimal(event.params.data.toHexString().slice(138), 18)

  let poolTokenId = poolId.concat('-').concat(address.toHexString())
  let poolToken = PoolToken.load(poolTokenId)

  if (poolToken == null) {
    createPoolTokenEntity(poolTokenId, poolId, address.toHexString())
    poolToken = PoolToken.load(poolTokenId)
    pool.totalWeight += denormWeight
    return
  } else {
    let oldWeight = poolToken.denormWeight
    if (denormWeight > oldWeight) {
      pool.totalWeight = pool.totalWeight + (denormWeight - oldWeight)
    } else {
      pool.totalWeight = pool.totalWeight - (oldWeight - denormWeight)
    }
  }

  let balance = hexToDecimal(event.params.data.toHexString().slice(74,138), poolToken.decimals)

  poolToken.balance = balance
  poolToken.denormWeight = denormWeight
  poolToken.save()

  if (balance.equals(ZERO_BD)) {
    decrPoolCount(pool.active, pool.finalized, pool.crp)
    pool.active = false
  }
  pool.save()

  updatePoolLiquidity(poolId)
  saveTransaction(event, 'rebind')
}

export function handleUnbind(event: LOG_CALL): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)

  if(pool != null) {

    let tokenBytes = Bytes.fromHexString(event.params.data.toHexString().slice(-40)) as Bytes
    let tokensList = pool.tokensList || []
    let index = tokensList.indexOf(tokenBytes)
    tokensList.splice(index, 1)
    pool.tokensList = tokensList
    pool.tokensCount = BigInt.fromI32(tokensList.length)

    let address = Address.fromString(event.params.data.toHexString().slice(-40))
    let poolTokenId = poolId.concat('-').concat(address.toHexString())
    let poolToken = PoolToken.load(poolTokenId)

    if(poolToken == null) return

    pool.totalWeight -= poolToken.denormWeight
    pool.save()
    store.remove('PoolToken', poolTokenId)

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'unbind')
  }
}

export function handleGulp(call: GulpCall): void {
  let poolId = call.to.toHexString()
  let pool = Pool.load(poolId)

  let address = call.inputs.token.toHexString()

  let bpool = BPool.bind(Address.fromString(poolId))
  let balanceCall = bpool.try_getBalance(Address.fromString(address))

  let poolTokenId = poolId.concat('-').concat(address)
  let poolToken = PoolToken.load(poolTokenId)

  if (poolToken != null) {
    let balance = ZERO_BD
    if (!balanceCall.reverted) {
      balance = bigIntToDecimal(balanceCall.value, poolToken.decimals)
    }
    poolToken.balance = balance
    poolToken.save()
  }

  updatePoolLiquidity(poolId)
}

/************************************
 ********** JOINS & EXITS ***********
 ************************************/

export function handleJoinPool(event: LOG_JOIN): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)

  if(pool != null) {

    pool.joinsCount = pool.joinsCount.plus(BigInt.fromI32(1))
    pool.save()

    let address = event.params.tokenIn.toHex()
    let poolTokenId = poolId.concat('-').concat(address.toString())
    let poolToken = PoolToken.load(poolTokenId)

    if(poolToken != null) {

      let tokenAmountIn = tokenToDecimal(event.params.tokenAmountIn.toBigDecimal(), poolToken.decimals)
      let newAmount = poolToken.balance.plus(tokenAmountIn)
      poolToken.balance = newAmount
      poolToken.save()
    }

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'join')
  }
}

export function handleExitPool(event: LOG_EXIT): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)
  let address = event.params.tokenOut.toHex()
  let poolTokenId = poolId.concat('-').concat(address.toString())

  if(pool != null) {

    let poolToken = PoolToken.load(poolTokenId)
    if(poolToken != null) {

      let tokenAmountOut = tokenToDecimal(event.params.tokenAmountOut.toBigDecimal(), poolToken.decimals)
      let newAmount = poolToken.balance.minus(tokenAmountOut)
      poolToken.balance = newAmount
      poolToken.save()
  
      pool.exitsCount += BigInt.fromI32(1)

      if (newAmount.equals(ZERO_BD)) {
        decrPoolCount(pool.active, pool.finalized, pool.crp)
        pool.active = false
      }
    }
    pool.save()

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'exit')
  }
}

export function handleSmartJoinPool(event: LogJoin): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let pool = Pool.load(poolId)

  if(pool != null) {

    let address = event.params.tokenIn.toHex()
    let poolTypeId = poolId.concat('-').concat(address.toString())
    let poolType = PoolToken.load(poolTypeId)

    if(poolType != null) {

      let tokenAmountIn = tokenToDecimal(event.params.tokenAmountIn.toBigDecimal(), poolType.decimals)

      // let newAmount = poolType.balance.plus(tokenAmountIn)
      let newAmount = poolType.balance
      poolType.balance = newAmount
      poolType.save()
      saveTransaction(event, 'LogJoin', poolId, address, tokenAmountIn, newAmount)
    }

    pool.save()
    updatePoolLiquidity(poolId)
  
  }
}

export function handleSmartExitPool(event: LogExit): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let pool = Pool.load(poolId)

  if(pool != null) {

    let address = event.params.tokenOut.toHex()
    let poolTypeId = poolId.concat('-').concat(address.toString())
    let poolType = PoolToken.load(poolTypeId)
    if(poolType != null) {
      let tokenAmountOut = tokenToDecimal(event.params.tokenAmountOut.toBigDecimal(), poolType.decimals)
      // let newAmount = poolType.balance.minus(tokenAmountOut)
      let newAmount = poolType.balance
      poolType.balance = newAmount
      poolType.save()

      saveTransaction(event, 'LogExit', poolId, address, tokenAmountOut, newAmount)
    }

    pool.save()
    updatePoolLiquidity(poolId)
 
  }
}

export function handleShareJoinPool(event: LogCall): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let pool = Pool.load(poolId)

  if(pool != null) {

    let callData = event.params.data.toHexString()
    let splitString = callData.split("0x34e7a19f")
    if (splitString.length < 2) return
    let lpTokenShare = '0x'+splitString[1].slice(0, 64)
    let lpTokenHex = hexToDecimal(lpTokenShare, 18)

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'LogCallJoinPool', poolId, '', ZERO_BD, ZERO_BD, lpTokenHex)
    pool.save()

  }
}

export function handleShareExitPool(event: LogCall): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let pool = Pool.load(poolId)
  
  if(pool != null) { 
    let callData = event.params.data.toHexString()
    let splitString = callData.split("0xeaede434")
    if (splitString.length < 2) return
    let lpTokenShare = '0x'+splitString[1].slice(0, 64)
    let lpTokenHex = hexToDecimal(lpTokenShare, 18)

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'LogCallExitPool', poolId, '', ZERO_BD, ZERO_BD, lpTokenHex)
    pool.save()
  }
}

export function handleShareExitPoolWithSig(event: LogCall): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let pool = Pool.load(poolId)

  if (pool != null) {
    let callData = event.params.data.toHexString()
    let splitString = callData.split("0x926afadf")
    if (splitString.length < 2) return
    // exitPoolWithSig(account, poolAmountIn, slippage, validAfter, v, r, s)
    // first 32 bytes is account, second 32 bytes is poolAmountIn
    let lpTokenShare = '0x' + splitString[1].slice(64, 128)
    let lpTokenHex = hexToDecimal(lpTokenShare, 18)

    updatePoolLiquidity(poolId)
    saveTransaction(event, 'LogCallExitPoolWithSig', poolId, '', ZERO_BD, ZERO_BD, lpTokenHex)
    pool.save()
  }
}

export function handleSmartTransfer(event: SmartPoolTransfer): void {
  let crp = ConfigurableRightsPool.bind(event.address)
  let poolId = getCrpUnderlyingPool(crp)!
  let self = event.address.toHex()

  let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  let fromAddress = event.params.from
  let toAddress = event.params.to

  let isMint = fromAddress.toHex() == ZERO_ADDRESS
  // seller
  let isBurn = toAddress.toHex() == ZERO_ADDRESS
  let fromNormalized = (isMint || fromAddress.toHex() == self) ? fromAddress : normalizeUserAddress(fromAddress)
  let toNormalized = (isBurn || toAddress.toHex() == self) ? toAddress : normalizeUserAddress(toAddress)

  let pool = Pool.load(poolId)
  if (pool != null) {
    // Keep totalShares aligned with on-chain CRP supply to avoid drift from missed/duplicated events.
    let totalSupplyCall = crp.try_totalSupply()
    if (!totalSupplyCall.reverted) {
      pool.totalShares = bigIntToDecimal(totalSupplyCall.value, 18)
    }

    // Sync "to" holder balance using on-chain state.
    if (!isBurn && toAddress.toHex() != self) {
      let toShareId = poolId.concat('-').concat(toNormalized.toHex())
      let toShare = PoolShare.load(toShareId)
      let toPrev = toShare == null ? ZERO_BD : toShare.balance
      if (toShare == null) {
        createPoolShareEntity(toShareId, poolId, toNormalized.toHex())
        toShare = PoolShare.load(toShareId)
      }
      let toBalCall = crp.try_balanceOf(toNormalized)
      if (toShare != null && !toBalCall.reverted) {
        let toNow = bigIntToDecimal(toBalCall.value, 18)
        if (toNow.equals(ZERO_BD)) {
          store.remove('PoolShare', toShareId)
        } else {
          toShare.balance = toNow
          toShare.userBalance = toNow
          toShare.save()
        }
        if (toPrev.equals(ZERO_BD) && toNow.notEqual(ZERO_BD)) {
          pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1))
        }
      }
    }

    // Sync "from" holder balance using on-chain state.
    if (!isMint && fromAddress.toHex() != self) {
      let fromShareId = poolId.concat('-').concat(fromNormalized.toHex())
      let fromShare = PoolShare.load(fromShareId)
      let fromPrev = fromShare == null ? ZERO_BD : fromShare.balance
      if (fromShare == null) {
        createPoolShareEntity(fromShareId, poolId, fromNormalized.toHex())
        fromShare = PoolShare.load(fromShareId)
      }
      let fromBalCall = crp.try_balanceOf(fromNormalized)
      if (fromShare != null && !fromBalCall.reverted) {
        let fromNow = bigIntToDecimal(fromBalCall.value, 18)
        if (fromNow.equals(ZERO_BD)) {
          store.remove('PoolShare', fromShareId)
        } else {
          fromShare.balance = fromNow
          fromShare.userBalance = fromNow
          fromShare.save()
        }
        if (fromPrev.notEqual(ZERO_BD) && fromNow.equals(ZERO_BD)) {
          pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1))
        }
      }
    }

    pool.save()
  }
}

export function handleLogWhiteList(event: LogCall): void {
  event
}

export function handleWhiteListLiqudityProvider(event: LogCall): void {
  event
}

export function handleRemoveWhitelistedLiquidityProvider(event: LogCall): void {
  event
}

export function handlePoolTokenInit(event: LogCall): void {
  event
}

export function handleSwap(event: LOG_SWAP): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)
  if (pool == null) return

  let swapId = event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString())
  let swap = new Swap(swapId)

  swap.caller = event.params.caller
  swap.tokenIn = event.params.tokenIn
  swap.tokenOut = event.params.tokenOut

  let tokenInEntityId = poolId.concat('-').concat(event.params.tokenIn.toHexString())
  let tokenOutEntityId = poolId.concat('-').concat(event.params.tokenOut.toHexString())

  let tokenInEntity = PoolToken.load(tokenInEntityId)
  if (tokenInEntity == null) {
    createPoolTokenEntity(tokenInEntityId, poolId, event.params.tokenIn.toHexString())
    tokenInEntity = PoolToken.load(tokenInEntityId)
  }

  let tokenOutEntity = PoolToken.load(tokenOutEntityId)
  if (tokenOutEntity == null) {
    createPoolTokenEntity(tokenOutEntityId, poolId, event.params.tokenOut.toHexString())
    tokenOutEntity = PoolToken.load(tokenOutEntityId)
  }

  let inDecimals = tokenInEntity == null ? 18 : tokenInEntity.decimals
  let outDecimals = tokenOutEntity == null ? 18 : tokenOutEntity.decimals

  swap.tokenInSym = tokenInEntity == null || tokenInEntity.symbol == null ? '' : tokenInEntity.symbol!
  swap.tokenOutSym = tokenOutEntity == null || tokenOutEntity.symbol == null ? '' : tokenOutEntity.symbol!

  swap.tokenAmountIn = bigIntToDecimal(event.params.tokenAmountIn, inDecimals)
  swap.tokenAmountOut = bigIntToDecimal(event.params.tokenAmountOut, outDecimals)

  swap.poolAddress = poolId
  let userId = event.transaction.from.toHex()
  createUserEntity(userId)
  swap.userAddress = userId

  swap.value = ZERO_BD
  swap.feeValue = ZERO_BD
  swap.poolTotalSwapVolume = pool.totalSwapVolume
  swap.poolTotalSwapFee = pool.totalSwapFee
  swap.poolLiquidity = pool.liquidity
  swap.timestamp = event.block.timestamp.toI32()
  swap.save()

  pool.swapsCount = pool.swapsCount.plus(BigInt.fromI32(1))
  pool.save()

  saveTransaction(event, 'swap', poolId, event.params.tokenIn.toHex(), swap.tokenAmountIn, swap.tokenAmountOut)
}

export function handleTransfer(event: Transfer): void {
  let poolId = event.address.toHex()
  let pool = Pool.load(poolId)
  if (pool == null) return
  let self = event.address.toHex()

  let zeroAddress = '0x0000000000000000000000000000000000000000'
  let fromAddr = event.params.from
  let toAddr = event.params.to
  let from = fromAddr.toHex()
  let to = toAddr.toHex()
  let fromNormalized = from == zeroAddress ? fromAddr : normalizeUserAddress(fromAddr)
  let toNormalized = to == zeroAddress ? toAddr : normalizeUserAddress(toAddr)
  let amount = bigIntToDecimal(event.params.value, 18)

  if (from != zeroAddress && from != self) {
    let fromShareId = poolId.concat('-').concat(fromNormalized.toHex())
    let fromShare = PoolShare.load(fromShareId)
    if (fromShare == null) {
      createPoolShareEntity(fromShareId, poolId, fromNormalized.toHex())
      fromShare = PoolShare.load(fromShareId)
    }
    if (fromShare != null) {
      let prev = fromShare.balance
      fromShare.balance = prev.minus(amount)
      if (fromShare.balance.equals(ZERO_BD)) {
        store.remove('PoolShare', fromShareId)
      } else {
        fromShare.save()
      }
      if (prev.notEqual(ZERO_BD) && fromShare.balance.equals(ZERO_BD)) {
        pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1))
      }
    }
  }

  if (to != zeroAddress && to != self) {
    let toShareId = poolId.concat('-').concat(toNormalized.toHex())
    let toShare = PoolShare.load(toShareId)
    if (toShare == null) {
      createPoolShareEntity(toShareId, poolId, toNormalized.toHex())
      toShare = PoolShare.load(toShareId)
    }
    if (toShare != null) {
      let prev = toShare.balance
      toShare.balance = prev.plus(amount)
      if (toShare.balance.equals(ZERO_BD)) {
        store.remove('PoolShare', toShareId)
      } else {
        toShare.save()
      }
      if (prev.equals(ZERO_BD) && toShare.balance.notEqual(ZERO_BD)) {
        pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1))
      }
    }
  }

  if (from == zeroAddress) {
    pool.totalShares = pool.totalShares.plus(amount)
  } else if (to == zeroAddress) {
    pool.totalShares = pool.totalShares.minus(amount)
  }

  pool.save()
}
