// List of Merchant Center product attributes monitored by the Feed Monitor.
// `critical: true` flags attributes whose changes raise a red alert (typically
// fields that drive PMax segmentation, eligibility, or bidding).

export const MONITORED_ATTRIBUTES = {
  // Critical — directly impact segmentation, eligibility, bidding
  brand:                    { critical: true,  label: 'Marque' },
  product_type:             { critical: true,  label: 'Type de produit' },
  google_product_category:  { critical: true,  label: 'Catégorie Google' },
  custom_label_0:           { critical: true,  label: 'Custom label 0' },
  custom_label_1:           { critical: true,  label: 'Custom label 1' },
  custom_label_2:           { critical: true,  label: 'Custom label 2' },
  custom_label_3:           { critical: true,  label: 'Custom label 3' },
  custom_label_4:           { critical: true,  label: 'Custom label 4 (POAS)' },
  availability:             { critical: true,  label: 'Disponibilité' },
  condition:                { critical: true,  label: 'État' },

  // Important — competitiveness signals
  price:                    { critical: false, label: 'Prix' },
  sale_price:               { critical: false, label: 'Prix promo' },
  sale_price_effective_date:{ critical: false, label: 'Date promo' },

  // Less critical but still tracked
  title:                    { critical: false, label: 'Titre' },
  description:              { critical: false, label: 'Description' },
  image_link:               { critical: false, label: 'Image principale' },
  additional_image_link:    { critical: false, label: 'Images additionnelles' },
  gtin:                     { critical: false, label: 'GTIN' },
  mpn:                      { critical: false, label: 'MPN' },
  identifier_exists:        { critical: false, label: 'Identifier exists' },
  shipping:                 { critical: false, label: 'Livraison' },
  shipping_weight:          { critical: false, label: 'Poids' },
  item_group_id:            { critical: false, label: "Groupe d'items" },
  color:                    { critical: false, label: 'Couleur' },
  size:                     { critical: false, label: 'Taille' },
  gender:                   { critical: false, label: 'Genre' },
  age_group:                { critical: false, label: "Tranche d'âge" },
  material:                 { critical: false, label: 'Matériau' },
  pattern:                  { critical: false, label: 'Motif' },
  tax_category:             { critical: false, label: 'Catégorie taxe' },
  energy_efficiency_class:  { critical: false, label: 'Classe énergétique' },
};

export const CRITICAL_ATTRIBUTES = Object.keys(MONITORED_ATTRIBUTES)
  .filter(k => MONITORED_ATTRIBUTES[k].critical);

export const ALL_ATTRIBUTES = Object.keys(MONITORED_ATTRIBUTES);

export function isCritical(attr) {
  return MONITORED_ATTRIBUTES[attr]?.critical === true;
}

export function attributeLabel(attr) {
  return MONITORED_ATTRIBUTES[attr]?.label || attr;
}
