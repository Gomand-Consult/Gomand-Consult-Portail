// Réglages propres à Gomand Consult. Modifiez ici le contact, les catégories et les statuts.
export const CONTACT = {
  whatsapp: '32496903051', // numéro international, sans « + »
  email: 'anthony@gomandconsult.com',
};

export const CATS = [
  ['devis', 'Devis'],
  ['factures', 'Factures'],
  ['livrables', 'Livrables'],
  ['comptes-rendus', 'Comptes rendus'],
];

export const STATUS_PRESETS = {
  devis: ['Envoyé', 'Accepté'],
  factures: ['À payer', 'Payée'],
  livrables: ['Version 1', 'Version 2', 'Version finale'],
  'comptes-rendus': ['Envoyé'],
};

export const DEC_LABEL = { none: 'À examiner', approved: 'Approuvée', rejected: 'Refusée', comment: 'À discuter' };

// Identité de l'éditeur (reprise de gomandconsult.com). Complétez bce et vat : ils s'affichent dès qu'ils sont renseignés.
export const LEGAL = {
  name: 'Gomand Consult SRL',
  form: 'Société à responsabilité limitée (SRL)',
  address: 'Rue du Moulin 35, 1457 Walhain, Belgique',
  phone: '+32 496 90 30 51',
  privacyEmail: 'hello@gomandconsult.com',
  bce: '', // numéro d'entreprise (BCE), ex. 0123.456.789
  vat: '', // numéro de TVA, ex. BE 0123.456.789
  siteCookiesUrl: 'https://gomandconsult.com/politique-cookies.html',
};
// À changer à chaque modification importante de la politique : chaque client est invité à en reprendre connaissance.
export const PRIVACY_VERSION = '2026-10-05';
export const PRIVACY_DATE = '5 octobre 2026';
export const RETENTION_MONTHS = 12;

export const MIN_PASSWORD = 12;
export const MAX_PDF_MB = 50;
