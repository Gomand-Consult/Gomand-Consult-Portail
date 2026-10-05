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

export const MIN_PASSWORD = 12;
export const MAX_PDF_MB = 50;
