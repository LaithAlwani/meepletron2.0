/** Denormalized searchable text: title + designers + publishers + categories + mechanics. */
export function buildSearchText(fields: {
  title: string;
  designers?: string[];
  publishers?: string[];
  categories?: string[];
  gameMechanics?: string[];
}): string {
  return [
    fields.title,
    ...(fields.designers ?? []),
    ...(fields.publishers ?? []),
    ...(fields.categories ?? []),
    ...(fields.gameMechanics ?? []),
  ].join(" ");
}
