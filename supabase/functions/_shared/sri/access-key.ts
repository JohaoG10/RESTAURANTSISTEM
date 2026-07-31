import { COD_DOC_FACTURA, TIPO_EMISION_NORMAL } from "./constants.ts";

export type AccessKeyInput = {
  emissionDate: Date;
  docType?: string;
  ruc: string;
  environment: "test" | "production";
  establishment: string;
  emissionPoint: string;
  sequential: number;
  numericCode?: string;
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDateDdMmYyyy(date: Date): string {
  return `${pad2(date.getDate())}${pad2(date.getMonth() + 1)}${date.getFullYear()}`;
}

function randomNumericCode(): string {
  return Math.floor(Math.random() * 100_000_000)
    .toString()
    .padStart(8, "0");
}

/** Dígito verificador módulo 11 (clave de acceso SRI, 49 dígitos). */
export function computeModulo11CheckDigit(clave48: string): string {
  const weights = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  let weightIndex = 0;
  for (let i = clave48.length - 1; i >= 0; i--) {
    sum += Number(clave48[i]) * weights[weightIndex];
    weightIndex = (weightIndex + 1) % weights.length;
  }
  const mod = sum % 11;
  const check = 11 - mod;
  if (check === 11) return "0";
  if (check === 10) return "1";
  return String(check);
}

export function generateAccessKey(input: AccessKeyInput): string {
  const datePart = formatDateDdMmYyyy(input.emissionDate);
  const docType = input.docType ?? COD_DOC_FACTURA;
  const ruc = input.ruc.padStart(13, "0").slice(0, 13);
  const ambiente = input.environment === "production" ? "2" : "1";
  const estab = input.establishment.padStart(3, "0").slice(0, 3);
  const ptoEmi = input.emissionPoint.padStart(3, "0").slice(0, 3);
  const secuencial = input.sequential.toString().padStart(9, "0").slice(0, 9);
  const codNumerico = input.numericCode ?? randomNumericCode();
  const tipoEmision = TIPO_EMISION_NORMAL;

  const clave48 =
    datePart +
    docType +
    ruc +
    ambiente +
    estab +
    ptoEmi +
    secuencial +
    codNumerico +
    tipoEmision;

  return clave48 + computeModulo11CheckDigit(clave48);
}

export function formatEmissionDateSlash(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}
