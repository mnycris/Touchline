// Small bits of English for generated text.

/** 'a' or 'an' for a word, by its sound (an ankle knock, a hamstring strain, an MCL tear, a union). */
export const aOrAn = (word: string) => (/^(?:[aeio]|u(?!ni|se|su|ro)|hour|honou?r|[fhlmnrsx]\b|mcl|acl)/i.test(word.trim()) ? 'an' : 'a')

/** 1st, 2nd, 3rd, 11th, 22nd. */
export const ordinalOf = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
