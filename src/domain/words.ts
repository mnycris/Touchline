// Small bits of English for generated text.

/** 'a' or 'an' for a word, by its sound (an ankle knock, a hamstring strain, an MCL tear, a union). */
export const aOrAn = (word: string) => (/^(?:[aeio]|u(?!ni|se|su|ro)|hour|honou?r|[fhlmnrsx]\b|mcl|acl)/i.test(word.trim()) ? 'an' : 'a')
