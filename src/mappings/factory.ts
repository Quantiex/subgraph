import { Address, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import { LOG_NEW_POOL } from '../types/Factory/Factory'
import { Tidalx, Pool } from '../types/schema'
import { Pool as PoolContract, CrpController as CrpControllerContract } from '../types/templates'
import {
  ZERO_BD,
  getCrpController,
  getManageFee,
  getCrpSymbol,
  getCrpName,
  getCrpRights,
  getCrpCap,
  normalizeUserAddress
} from './helpers'
import { ConfigurableRightsPool } from '../types/Factory/ConfigurableRightsPool';

export function handleNewPool(event: LOG_NEW_POOL): void {
  let factory = Tidalx.load('1')

  // if no factory yet, set up blank initial
  if (factory == null) {
    factory = new Tidalx('1')
    factory.color = 'Bronze'
    factory.poolCount = 0
    factory.finalizedPoolCount = 0
    factory.crpCount = 0
    factory.txCount = BigInt.fromI32(0)
    factory.totalLiquidity = ZERO_BD
    factory.totalSwapVolume = ZERO_BD
    factory.totalSwapFee = ZERO_BD
  }

  let pool = new Pool(event.params.pool.toHexString())
  let crp = ConfigurableRightsPool.bind(event.params.caller)
  let callerBPool = crp.try_bPool()
  // Robust CRP detection: don't rely on a single CRPFactory registry address.
  // If caller exposes bPool() and points to the newly created pool, treat as CRP.
  pool.crp = !callerBPool.reverted && callerBPool.value.equals(event.params.pool)
  if (!pool.crp) {
    return
  }
  pool.rights = []

  factory.crpCount += 1
  pool.symbol = getCrpSymbol(crp)
  pool.name = getCrpName(crp)
  let crpCon = getCrpController(crp)
  if(crpCon === null) {
    pool.crpController = null
  }else{
    pool.crpController = normalizeUserAddress(Address.fromString(crpCon))
  }
 
  pool.rights = getCrpRights(crp)
  pool.cap = getCrpCap(crp)
  pool.managerFee = getManageFee(crp)
  // Listen for any future crpController changes.
  CrpControllerContract.create(event.params.caller)
  pool.controller = event.params.caller
  pool.publicSwap = false
  pool.finalized = false
  pool.active = true
  pool.swapFee = BigDecimal.fromString('0.000001')
  pool.totalWeight = ZERO_BD
  pool.totalShares = ZERO_BD
  pool.totalSwapVolume = ZERO_BD
  pool.totalSwapFee = ZERO_BD
  pool.liquidity = ZERO_BD
  pool.createTime = event.block.timestamp.toI32()
  pool.tokensCount = BigInt.fromI32(0)
  pool.holdersCount = BigInt.fromI32(0)
  pool.joinsCount = BigInt.fromI32(0)
  pool.exitsCount = BigInt.fromI32(0)
  pool.swapsCount = BigInt.fromI32(0)
  pool.factoryID = event.address.toHexString()
  pool.tokensList = []
  pool.tokensOriginalList = []
  pool.tx = event.transaction.hash
  pool.save()

  factory.poolCount = factory.poolCount + 1
  factory.save()

  PoolContract.create(event.params.pool)
}
