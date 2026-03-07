import {
    BigDecimal,
    Address,
    BigInt,
    Bytes,
    dataSource,
    ethereum,
    log
  } from '@graphprotocol/graph-ts'
  import {
    Pool,
    User,
    PoolToken,
    PoolShare,
    TokenPrice,
    Transaction,
    Tidalx
  } from '../types/schema'
  import { BTokenBytes } from '../types/templates/Pool/BTokenBytes'
  import { BToken } from '../types/templates/Pool/BToken'
  import { CRPFactory } from '../types/Factory/CRPFactory'
  import { ConfigurableRightsPool } from '../types/Factory/ConfigurableRightsPool'
  import { QProxyFactory } from '../types/Factory/QProxyFactory'
  import { QProxy } from '../types/Factory/QProxy'
  
  export let ZERO_BD = BigDecimal.fromString('0')
  
  let network = dataSource.network()
  
   // Config for mainnet
  let WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
  let USD = '0x76dD2892E24259D2BD2A10BF7e4302F2D649d780'
  let DAI = '0x5B835d23f6e99f65d68A401E2c06e2FFE4944fA9'
  let CRP_FACTORY = '0xC0B73bc0D2600263B97008EedEb5A710648912Dd'
  let QPROXY_FACTORY = '0x0000000000000000000000000000000000000000'
  
  if (network == 'sepolia') {
    WETH = '0x0F6fEC6fadBE55c2140429B2EF3445aF474cae15'
    USD = '0x76dD2892E24259D2BD2A10BF7e4302F2D649d780'
    DAI = '0x5B835d23f6e99f65d68A401E2c06e2FFE4944fA9'
    CRP_FACTORY = '0x5c4B2021fE482059C78e112b8FC2Bd8334a22799'
    QPROXY_FACTORY = '0xD96Ba1ac4f13749f456286A5ECB8C4C747762A60'
  }
  
  export function hexToDecimal(hexString: string, decimals: i32): BigDecimal {
    let bytes = Bytes.fromHexString(hexString).reverse() as Bytes
    let bi = BigInt.fromUnsignedBytes(bytes)
    let scale = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    return bi.divDecimal(scale)
  }
  
  export function bigIntToDecimal(amount: BigInt, decimals: i32): BigDecimal {
    let scale = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    return amount.toBigDecimal().div(scale)
  }
  
  export function tokenToDecimal(amount: BigDecimal, decimals: i32): BigDecimal {
    let scale = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    return amount.div(scale)
  }
  
  export function createPoolShareEntity(id: string, pool: string, user: string): void {
    let poolShare = new PoolShare(id)
  
    createUserEntity(user)
  
    poolShare.userAddress = user
    poolShare.poolId = pool
    poolShare.balance = ZERO_BD
    poolShare.userBalance = ZERO_BD
    poolShare.save()
  }
  
  export function createPoolTokenEntity(id: string, pool: string, address: string): void {
    let token = BToken.bind(Address.fromString(address))
    let tokenBytes = BTokenBytes.bind(Address.fromString(address))
    let symbol = ''
    let name = ''
    let decimals = 18
  
    // COMMENT THE LINES BELOW OUT FOR LOCAL DEV ON KOVAN
  
    let symbolCall = token.try_symbol()
    let nameCall = token.try_name()
    let decimalCall = token.try_decimals()
  
    if (symbolCall.reverted) {
      let symbolBytesCall = tokenBytes.try_symbol()
      if (!symbolBytesCall.reverted) {
        symbol = symbolBytesCall.value.toString()
      }
    } else {
      symbol = symbolCall.value
    }
  
    if (nameCall.reverted) {
      let nameBytesCall = tokenBytes.try_name()
      if (!nameBytesCall.reverted) {
        name = nameBytesCall.value.toString()
      }
    } else {
      name = nameCall.value
    }
  
    if (!decimalCall.reverted) {
      decimals = decimalCall.value
    }
  
    let poolToken = new PoolToken(id)
    poolToken.poolId = pool
    poolToken.address = address
    poolToken.name = name
    poolToken.symbol = symbol
    poolToken.decimals = decimals
    poolToken.balance = ZERO_BD
    poolToken.denormWeight = ZERO_BD
    poolToken.save()
  }
  
  export function updatePoolLiquidity(id: string): void {
    let pool = Pool.load(id)
  
    if(pool == null) return
  
    let tokensList: Array<Bytes> = pool.tokensList
    let tokensOriginalList: Array<Bytes> = pool.tokensList
  
    if (pool.tokensCount.equals(BigInt.fromI32(0))) {
      pool.liquidity = ZERO_BD
      pool.save()
      return
    }
  
    if (!tokensList || pool.tokensCount.lt(BigInt.fromI32(2)) || !pool.publicSwap) return
  
    // Find pool liquidity
  
    let hasPrice = false
    let hasUsdPrice = false
    let poolLiquidity = ZERO_BD
  
    if (tokensList.includes(Address.fromString(WETH))) {
      let wethTokenPrice = TokenPrice.load(WETH)
      if (wethTokenPrice !== null) {
        let poolTokenId = id.concat('-').concat(WETH)
        let poolToken = PoolToken.load(poolTokenId)
  
        if(poolToken == null) return
  
        poolLiquidity = wethTokenPrice.price.times(poolToken.balance).div(poolToken.denormWeight).times(pool.totalWeight)
        hasPrice = true
      }
    } else if (tokensList.includes(Address.fromString(DAI))) {
      let daiTokenPrice = TokenPrice.load(DAI)
      if (daiTokenPrice !== null) {
        let poolTokenId = id.concat('-').concat(DAI)
        let poolToken = PoolToken.load(poolTokenId)
  
        if(poolToken == null) return
  
        poolLiquidity = daiTokenPrice.price.times(poolToken.balance).div(poolToken.denormWeight).times(pool.totalWeight)
        hasPrice = true
      }
    }
  
    // Create or update token price
  
    if (hasPrice) {
      for (let i: i32 = 0; i < tokensList.length; i++) {
        let tokenPriceId = tokensList[i].toHexString()
        let tokenPrice = TokenPrice.load(tokenPriceId)
        if (tokenPrice == null) {
          tokenPrice = new TokenPrice(tokenPriceId)
          tokenPrice.poolTokenId = ''
          tokenPrice.poolLiquidity = ZERO_BD
        }
  
        let poolTokenId = id.concat('-').concat(tokenPriceId)
        let poolToken = PoolToken.load(poolTokenId)
        if(poolToken != null){
          if (
            pool.active && !pool.crp && pool.tokensCount.notEqual(BigInt.fromI32(0)) && pool.publicSwap &&
            (tokenPrice.poolTokenId == poolTokenId || poolLiquidity.gt(tokenPrice.poolLiquidity)) &&
            (
              (tokenPriceId != WETH.toString() && tokenPriceId != DAI.toString()) ||
              (pool.tokensCount.equals(BigInt.fromI32(2)) && hasUsdPrice)
            )
          ) {
            tokenPrice.price = ZERO_BD
  
            if (poolToken.balance.gt(ZERO_BD)) {
              tokenPrice.price = poolLiquidity.div(pool.totalWeight).times(poolToken.denormWeight).div(poolToken.balance)
            }
  
            tokenPrice.symbol = poolToken.symbol
            tokenPrice.name = poolToken.name
            tokenPrice.decimals = poolToken.decimals
            tokenPrice.poolLiquidity = poolLiquidity
            tokenPrice.poolTokenId = poolTokenId
            tokenPrice.save()
          }
        }
      }
    }
  
    // Update pool liquidity
  
    let liquidity = ZERO_BD
    let denormWeight = ZERO_BD
  
    for (let i: i32 = 0; i < tokensList.length; i++) {
      let tokenPriceId = tokensList[i].toHexString()
      let tokenPrice = TokenPrice.load(tokenPriceId)
      if (tokenPrice !== null) {
        let poolTokenId = id.concat('-').concat(tokenPriceId)
        let poolToken = PoolToken.load(poolTokenId)
        if(poolToken != null){
          if (tokenPrice.price.gt(ZERO_BD) && poolToken.denormWeight.gt(denormWeight)) {
            denormWeight = poolToken.denormWeight
            liquidity = tokenPrice.price.times(poolToken.balance).div(poolToken.denormWeight).times(pool.totalWeight)
          }
        }
      }
    }
  
    let factory = Tidalx.load('1')
  
    if(factory == null) return
  
    factory.totalLiquidity = factory.totalLiquidity.minus(pool.liquidity).plus(liquidity)
    factory.save()
  
    pool.liquidity = liquidity
    pool.tokensOriginalList = tokensOriginalList
    pool.save()
  }
  
  export function decrPoolCount(active: boolean, finalized: boolean, crp: boolean): void {
    if (active) {
      let factory = Tidalx.load('1')
      
      if(factory == null) return
  
      factory.poolCount = factory.poolCount - 1
      if (finalized) factory.finalizedPoolCount = factory.finalizedPoolCount - 1
      if (crp) factory.crpCount = factory.crpCount - 1
      factory.save()
    }
  }
  
  export function saveTransaction(
    event: ethereum.Event, 
    eventName: string, 
    poolAddress: string = '0',  
    tokenAddress: string = '0',
    tokenAmountInOut: BigDecimal = ZERO_BD,
    newAmount: BigDecimal = ZERO_BD,
    lpTokenShare: BigDecimal = ZERO_BD,
    ): void {
    let tx = event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString())
    let userAddress = event.transaction.from.toHex()
    let transaction = Transaction.load(tx)
    if (transaction == null) {
      transaction = new Transaction(tx)
    }
  
    let poolSmartAddress = poolAddress.length != 0 ? poolAddress : event.address.toHex()
    
    transaction.event = eventName
    transaction.poolAddress = poolSmartAddress
    transaction.tokenAddress = tokenAddress
    transaction.userAddress = userAddress
    transaction.gasUsed = ZERO_BD
    transaction.gasPrice = event.transaction.gasPrice.toBigDecimal()
    transaction.tx = event.transaction.hash
    transaction.timestamp = event.block.timestamp.toI32()
    transaction.block = event.block.number.toI32()
    transaction.newAmount = newAmount
    transaction.tokenAmountInOut = tokenAmountInOut
    transaction.lpTokenShare = lpTokenShare
    transaction.save()
  
    createUserEntity(userAddress)
  }
  
  export function createUserEntity(address: string): void {
    if (User.load(address) == null) {
      let user = new User(address)
      user.save()
    }
  }
  
  export function isCrp(address: Address, block: ethereum.Block): boolean {
    let crpFactory = CRPFactory.bind(Address.fromString(CRP_FACTORY))
    let isCrp = crpFactory.try_isCrp(address)
    if (isCrp.reverted) return false
    return isCrp.value
  }
  
  export function getCrpUnderlyingPool(crp: ConfigurableRightsPool): string | null {
    let bPool = crp.try_bPool()
    if (bPool.reverted) return null;
    return bPool.value.toHexString()
  }
  
  export function getCrpController(crp: ConfigurableRightsPool): string | null {
    let controller = crp.try_getController()
    if (controller.reverted) return null;
    return controller.value.toHexString()
  }
  
  export function getCrpSymbol(crp: ConfigurableRightsPool): string {
    let symbol = crp.try_symbol()
    if (symbol.reverted) return ''
    return symbol.value
  }
  
  export function getCrpName(crp: ConfigurableRightsPool): string {
    let name = crp.try_name()
    if (name.reverted) return ''
    return name.value
  }

  export function getCrpCap(crp: ConfigurableRightsPool): BigInt {
    let cap = crp.try_bspCap()
    if (cap.reverted) return BigInt.fromI32(0)
    return cap.value
  }
  
  export function getManageFee(crp: ConfigurableRightsPool): BigInt {
    let manageFee = crp.try_manageFee()
    if (manageFee.reverted) return BigInt.fromI32(0)
    return manageFee.value
  }
  
  export function getCrpRights(crp: ConfigurableRightsPool): string[] {
    let rights = crp.try_rights()
    if (rights.reverted) return []
    let rightsArr: string[] = []
    if (rights.value.value0) rightsArr.push('canChangeManageFee')
    if (rights.value.value1) rightsArr.push('canChangeWeights')
    if (rights.value.value2) rightsArr.push('canWhitelistLPs')
    if (rights.value.value3) rightsArr.push('canChangeCap')
    // if (rights.value.value4) rightsArr.push('canWhitelistLPs')
    // if (rights.value.value5) rightsArr.push('canChangeCap')
    return rightsArr
  }

  export function normalizeUserAddress(addr: Address): Address {
    // Primary detection: if contract behaves like QProxy (has cache() and owner()) treat holder as owner EOA.
    let proxy = QProxy.bind(addr)
    let cache = proxy.try_cache()
    if (!cache.reverted) {
      let owner = proxy.try_owner()
      if (!owner.reverted) {
        return owner.value
      }
    }

    // Secondary detection: known factory registry.
    if (QPROXY_FACTORY != '0x0000000000000000000000000000000000000000') {
      let pf = QProxyFactory.bind(Address.fromString(QPROXY_FACTORY))
      let isProxy = pf.try_isProxy(addr)
      if (!isProxy.reverted && isProxy.value) {
        let owner2 = proxy.try_owner()
        if (!owner2.reverted) {
          return owner2.value
        }
      }
    }

    return addr
  }
  
