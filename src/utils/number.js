export function parseNumber(v) {
  return Number.parseFloat(String(v).trim().replace(',', '.'))
}


