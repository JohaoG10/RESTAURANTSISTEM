import forge from "npm:node-forge@1.3.1";

type KeyMaterial = {
  privateKey: forge.pki.PrivateKey;
  certificatePem: string;
  certificateBase64: string;
};

function loadPkcs12(p12Bytes: Uint8Array, password: string): KeyMaterial {
  const binary = Array.from(p12Bytes, (byte) => String.fromCharCode(byte)).join("");
  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag = certBags[forge.pki.oids.certBag]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("No se pudo leer la clave privada o el certificado del archivo .p12");
  }

  const certificatePem = forge.pki.certificateToPem(certBag.cert);
  const certificateBase64 = forge.pki.certificateToPem(certBag.cert)
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  return {
    privateKey: keyBag.key,
    certificatePem,
    certificateBase64,
  };
}

function sha1Base64(value: string): string {
  const md = forge.md.sha1.create();
  md.update(value, "utf8");
  return forge.util.encode64(md.digest().getBytes());
}

function signRsaSha1Base64(value: string, privateKey: forge.pki.PrivateKey): string {
  const md = forge.md.sha1.create();
  md.update(value, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

/**
 * Firma XAdES-BES (enveloped) sobre el comprobante con id="comprobante".
 */
export function signXmlXadesBes(
  xml: string,
  p12Bytes: Uint8Array,
  password: string
): string {
  const { privateKey, certificateBase64 } = loadPkcs12(p12Bytes, password);

  const signatureId = `Signature-${crypto.randomUUID()}`;
  const signedPropsId = `SignedProperties-${crypto.randomUUID()}`;
  const signingTime = new Date().toISOString();

  const docDigest = sha1Base64(xml);
  const signedPropertiesXml =
    `<xades:SignedProperties Id="${signedPropsId}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;
  const signedPropsDigest = sha1Base64(signedPropertiesXml);

  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<ds:Reference Id="Reference-ID-${Date.now()}" URI="#comprobante">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`;

  const signatureValue = signRsaSha1Base64(signedInfo, privateKey);

  const signatureBlock =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">` +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo>` +
    `<ds:X509Data>` +
    `<ds:X509Certificate>${certificateBase64}</ds:X509Certificate>` +
    `</ds:X509Data>` +
    `</ds:KeyInfo>` +
    `<ds:Object>` +
    `<xades:QualifyingProperties Target="#${signatureId}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
    signedPropertiesXml +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`;

  return xml.replace("</factura>", `${signatureBlock}</factura>`);
}

export function p12BytesToUint8Array(data: ArrayBuffer): Uint8Array {
  return new Uint8Array(data);
}
