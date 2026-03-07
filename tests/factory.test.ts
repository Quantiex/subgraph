import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
  createMockedFunction
} from "matchstick-as/assembly/index"
import { Address, ethereum } from "@graphprotocol/graph-ts"
import { handleNewPool } from "../src/mappings/factory"
import { createLOG_NEW_POOLEvent } from "./factory-utils"

describe("factory mapping", () => {
  beforeAll(() => {
    let caller = Address.fromString("0x0000000000000000000000000000000000000001")
    let pool = Address.fromString("0x0000000000000000000000000000000000000002")

    createMockedFunction(
      Address.fromString("0xC0B73bc0D2600263B97008EedEb5A710648912Dd"),
      "isCrp",
      "isCrp(address):(bool)"
    )
      .withArgs([ethereum.Value.fromAddress(caller)])
      .returns([ethereum.Value.fromBoolean(false)])

    createMockedFunction(
      Address.fromString("0x5c4B2021fE482059C78e112b8FC2Bd8334a22799"),
      "isCrp",
      "isCrp(address):(bool)"
    )
      .withArgs([ethereum.Value.fromAddress(caller)])
      .returns([ethereum.Value.fromBoolean(false)])

    createMockedFunction(
      caller,
      "bPool",
      "bPool():(address)"
    ).returns([ethereum.Value.fromAddress(Address.fromString("0x0000000000000000000000000000000000000000"))])

    let event = createLOG_NEW_POOLEvent(caller, pool)
    handleNewPool(event)
  })

  afterAll(() => {
    clearStore()
  })

  test("ignores non-crp pools", () => {
    assert.entityCount("Tidalx", 0)
    assert.entityCount("Pool", 0)
  })
})
