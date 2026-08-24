import type { Prisma } from "database"

export class MoneyConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MoneyConversionError"
  }
}

/**
 * JavaScript Number cannot represent many decimal fractions exactly. Passing
 * Prisma Decimal values through Number can therefore change a monetary amount
 * when it is multiplied into minor units. Parse the decimal string as integer
 * parts instead so the provider always receives an exact integer.
 */
export function toMinorUnits(decimal: string | Prisma.Decimal, currency: string): number {
  const normalizedCurrency = currency.trim().toUpperCase()
  const value = decimal.toString().trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new MoneyConversionError("Money must be a non-negative decimal number.")
  }

  const [wholePart, fractionPart = ""] = value.split(".")
  if (normalizedCurrency === "GHS" && fractionPart.length > 2) {
    throw new MoneyConversionError("GHS amounts cannot contain more than two decimal places.")
  }

  const scale = normalizedCurrency === "GHS" ? 2 : 2
  const paddedFraction = fractionPart.padEnd(scale, "0")
  const minorUnits = Number.parseInt(wholePart, 10) * 10 ** scale + Number.parseInt(paddedFraction || "0", 10)
  if (!Number.isSafeInteger(minorUnits)) {
    throw new MoneyConversionError("Money amount is outside the safe integer range.")
  }
  return minorUnits
}
