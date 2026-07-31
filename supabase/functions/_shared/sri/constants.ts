/** URLs ambiente de pruebas SRI (celcer). */
export const SRI_TEST = {
  recepcion:
    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
  autorizacion:
    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
} as const;

export const SRI_PRODUCTION = {
  recepcion:
    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
  autorizacion:
    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
} as const;

/** Códigos SRI */
export const COD_DOC_FACTURA = "01";
export const TIPO_EMISION_NORMAL = "1";
export const MONEDA_DOLAR = "DOLAR";

export const TIPO_ID_COMPRADOR = {
  RUC: "04",
  CEDULA: "05",
  PASAPORTE: "06",
  CONSUMIDOR_FINAL: "07",
  EXTERIOR: "08",
} as const;

export const FORMA_PAGO = {
  cash: "01",
  card: "19",
  transfer: "20",
} as const;

export const COD_DOC_NOTA_VENTA = "02";

export const CODIGO_IVA = "2";
export const CODIGO_PORCENTAJE_IVA = "4";
