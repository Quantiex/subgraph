import { newMockEvent } from "matchstick-as"
import { ethereum, Address } from "@graphprotocol/graph-ts"
import {
  LOG_BLABS,
  LOG_NEW_POOL,
  LOG_ROUTER,
  LOG_USDT,
  LOG_VAULT
} from "../src/types/Factory/Factory"

export function createLOG_BLABSEvent(
  caller: Address,
  blabs: Address
): LOG_BLABS {
  let logBlabsEvent = changetype<LOG_BLABS>(newMockEvent())

  logBlabsEvent.parameters = new Array()

  logBlabsEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  logBlabsEvent.parameters.push(
    new ethereum.EventParam("blabs", ethereum.Value.fromAddress(blabs))
  )

  return logBlabsEvent
}

export function createLOG_NEW_POOLEvent(
  caller: Address,
  pool: Address
): LOG_NEW_POOL {
  let logNewPoolEvent = changetype<LOG_NEW_POOL>(newMockEvent())

  logNewPoolEvent.parameters = new Array()

  logNewPoolEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  logNewPoolEvent.parameters.push(
    new ethereum.EventParam("pool", ethereum.Value.fromAddress(pool))
  )

  return logNewPoolEvent
}

export function createLOG_ROUTEREvent(
  caller: Address,
  router: Address
): LOG_ROUTER {
  let logRouterEvent = changetype<LOG_ROUTER>(newMockEvent())

  logRouterEvent.parameters = new Array()

  logRouterEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  logRouterEvent.parameters.push(
    new ethereum.EventParam("router", ethereum.Value.fromAddress(router))
  )

  return logRouterEvent
}

export function createLOG_USDTEvent(
  caller: Address,
  router: Address
): LOG_USDT {
  let logUsdtEvent = changetype<LOG_USDT>(newMockEvent())

  logUsdtEvent.parameters = new Array()

  logUsdtEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  logUsdtEvent.parameters.push(
    new ethereum.EventParam("router", ethereum.Value.fromAddress(router))
  )

  return logUsdtEvent
}

export function createLOG_VAULTEvent(
  vault: Address,
  caller: Address
): LOG_VAULT {
  let logVaultEvent = changetype<LOG_VAULT>(newMockEvent())

  logVaultEvent.parameters = new Array()

  logVaultEvent.parameters.push(
    new ethereum.EventParam("vault", ethereum.Value.fromAddress(vault))
  )
  logVaultEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )

  return logVaultEvent
}
