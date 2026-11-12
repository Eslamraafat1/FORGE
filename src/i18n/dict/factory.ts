/** "factory" area dictionary. Keys are prefixed by module. English is the key source of truth. */
const en = {
} as const;

const ar: Record<keyof typeof en, string> = {
};

export const factoryDict = { en, ar };
