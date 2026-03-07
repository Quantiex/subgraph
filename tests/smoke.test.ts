import { assert, describe, test } from "matchstick-as/assembly/index"

describe("smoke", () => {
  test("basic assertion", () => {
    assert.booleanEquals(true, true)
  })
})

