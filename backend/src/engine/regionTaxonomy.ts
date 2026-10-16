/**
 * Origin constraints: original language (ISO 639-1, TMDB `with_original_language`)
 * and country of origin (ISO 3166-1, TMDB `with_origin_country`).
 *
 * Nationality adjectives are ambiguous. Where the adjective is also the name of a
 * widely used film language ("Korean", "Spanish") it is treated as a language, as
 * before. Other demonyms ("Malaysian", "Indian", "Nigerian") describe a country whose
 * films span several languages, so they map to country of origin instead.
 */

export interface OriginConstraint {
  code: string
  name: string
}

export const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', french: 'fr', spanish: 'es', german: 'de', italian: 'it', japanese: 'ja',
  korean: 'ko', hindi: 'hi', mandarin: 'zh', chinese: 'zh', portuguese: 'pt', swedish: 'sv',
  danish: 'da', norwegian: 'no', russian: 'ru', turkish: 'tr', thai: 'th', arabic: 'ar',
  polish: 'pl', cantonese: 'cn', malay: 'ms', 'bahasa malaysia': 'ms', 'bahasa melayu': 'ms',
  tamil: 'ta', telugu: 'te', malayalam: 'ml', kannada: 'kn', bengali: 'bn', marathi: 'mr',
  punjabi: 'pa', urdu: 'ur', gujarati: 'gu', tagalog: 'tl', 'bahasa indonesia': 'id',
  vietnamese: 'vi', persian: 'fa', farsi: 'fa', hebrew: 'he', greek: 'el', dutch: 'nl',
  flemish: 'nl', finnish: 'fi', icelandic: 'is', czech: 'cs', hungarian: 'hu', romanian: 'ro',
  ukrainian: 'uk', serbian: 'sr', croatian: 'hr', bosnian: 'bs', bulgarian: 'bg', slovak: 'sk',
  slovenian: 'sl', estonian: 'et', latvian: 'lv', lithuanian: 'lt', georgian: 'ka',
  armenian: 'hy', catalan: 'ca', basque: 'eu', galician: 'gl', welsh: 'cy', swahili: 'sw',
  yoruba: 'yo', zulu: 'zu', amharic: 'am', afrikaans: 'af', nepali: 'ne', sinhala: 'si',
  sinhalese: 'si', khmer: 'km', burmese: 'my', mongolian: 'mn', kazakh: 'kk', albanian: 'sq',
  macedonian: 'mk'
}

/** Demonyms that name a country rather than a single film language. */
export const COUNTRY_DEMONYMS: Record<string, string> = {
  malaysian: 'MY', singaporean: 'SG', indonesian: 'ID', filipino: 'PH', philippine: 'PH',
  vietnamese: 'VN', cambodian: 'KH', laotian: 'LA', burmese: 'MM', taiwanese: 'TW',
  'hong kong': 'HK', mongolian: 'MN', kazakhstani: 'KZ', indian: 'IN', bollywood: 'IN',
  pakistani: 'PK', bangladeshi: 'BD', 'sri lankan': 'LK', nepalese: 'NP', bhutanese: 'BT',
  afghan: 'AF', iranian: 'IR', iraqi: 'IQ', syrian: 'SY', jordanian: 'JO', palestinian: 'PS',
  israeli: 'IL', lebanese: 'LB', saudi: 'SA', emirati: 'AE', qatari: 'QA', kuwaiti: 'KW',
  egyptian: 'EG', moroccan: 'MA', tunisian: 'TN', algerian: 'DZ', nigerian: 'NG',
  nollywood: 'NG', ghanaian: 'GH', kenyan: 'KE', ugandan: 'UG', tanzanian: 'TZ',
  rwandan: 'RW', ethiopian: 'ET', senegalese: 'SN', malian: 'ML', ivorian: 'CI',
  cameroonian: 'CM', congolese: 'CD', zimbabwean: 'ZW', 'south african': 'ZA',
  mexican: 'MX', guatemalan: 'GT', 'costa rican': 'CR', panamanian: 'PA', cuban: 'CU',
  dominican: 'DO', 'puerto rican': 'PR', jamaican: 'JM', brazilian: 'BR', argentine: 'AR',
  argentinian: 'AR', chilean: 'CL', colombian: 'CO', peruvian: 'PE', venezuelan: 'VE',
  ecuadorian: 'EC', bolivian: 'BO', paraguayan: 'PY', uruguayan: 'UY', canadian: 'CA',
  american: 'US', british: 'GB', scottish: 'GB', irish: 'IE', australian: 'AU',
  'new zealand': 'NZ', 'south korean': 'KR', 'north korean': 'KP', belgian: 'BE', swiss: 'CH', austrian: 'AT'
}

/** Languages that take precedence over a same-named demonym, e.g. "Korean" → ko. */
const LANGUAGE_FIRST = new Set([
  'english', 'french', 'spanish', 'german', 'italian', 'japanese', 'korean', 'hindi',
  'mandarin', 'chinese', 'portuguese', 'swedish', 'danish', 'norwegian', 'russian',
  'turkish', 'thai', 'arabic', 'polish', 'cantonese', 'malay', 'tamil', 'telugu',
  'malayalam', 'kannada', 'bengali', 'marathi', 'punjabi', 'urdu', 'gujarati', 'tagalog',
  'persian', 'farsi', 'hebrew', 'greek', 'dutch', 'flemish', 'finnish', 'icelandic', 'czech',
  'hungarian', 'romanian', 'ukrainian', 'serbian', 'croatian', 'bosnian', 'bulgarian',
  'slovak', 'slovenian', 'estonian', 'latvian', 'lithuanian', 'georgian', 'armenian',
  'catalan', 'basque', 'galician', 'welsh', 'khmer', 'albanian', 'macedonian'
])

/** Home country for language-first adjectives, used only when adding to a country list ("Korean ones too"). */
const LANGUAGE_HOME_COUNTRY: Record<string, string> = {
  japanese: 'JP', korean: 'KR', french: 'FR', german: 'DE', italian: 'IT', thai: 'TH', chinese: 'CN',
  mandarin: 'CN', cantonese: 'HK', spanish: 'ES', portuguese: 'PT', swedish: 'SE', danish: 'DK',
  norwegian: 'NO', russian: 'RU', turkish: 'TR', polish: 'PL', greek: 'GR', dutch: 'NL', finnish: 'FI',
  icelandic: 'IS', czech: 'CZ', hungarian: 'HU', romanian: 'RO', ukrainian: 'UA', serbian: 'RS',
  croatian: 'HR', bulgarian: 'BG', slovak: 'SK', slovenian: 'SI', estonian: 'EE', latvian: 'LV',
  lithuanian: 'LT', georgian: 'GE', armenian: 'AM', albanian: 'AL', macedonian: 'MK', hebrew: 'IL',
  persian: 'IR', farsi: 'IR', tagalog: 'PH', khmer: 'KH', malay: 'MY', hindi: 'IN', urdu: 'PK'
}

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.': 'US', america: 'US', 'united states': 'US', uk: 'GB', 'u.k.': 'GB',
  britain: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  korea: 'KR', 'south korea': 'KR', 'north korea': 'KP', russia: 'RU', iran: 'IR',
  vietnam: 'VN', taiwan: 'TW', 'hong kong': 'HK', 'czech republic': 'CZ', czechia: 'CZ',
  holland: 'NL', 'the netherlands': 'NL', 'the philippines': 'PH', turkey: 'TR', 'türkiye': 'TR'
}

let countryNameIndex: Map<string, string> | undefined

/** Every ISO 3166-1 region name known to the runtime, plus common aliases. */
function getCountryNameIndex(): Map<string, string> {
  if (countryNameIndex) return countryNameIndex
  const index = new Map<string, string>(Object.entries(COUNTRY_NAME_ALIASES))
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const first of letters) {
      for (const second of letters) {
        const code = `${first}${second}`
        const name = names.of(code)
        if (name && name !== code && !/unknown/i.test(name)) {
          index.set(name.toLowerCase(), code)
        }
      }
    }
  } catch {
    // Intl region names unavailable; aliases and demonyms still apply.
  }
  countryNameIndex = index
  return index
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const titleCase = (value: string) => value.replace(/\b\w/g, char => char.toUpperCase())

export function demonymForCountry(code: string): string | undefined {
  const entry = Object.entries(COUNTRY_DEMONYMS).find(([word, value]) =>
    value === code && !/wood$/.test(word)
  ) || Object.entries(LANGUAGE_HOME_COUNTRY).find(([, value]) => value === code)
  return entry ? titleCase(entry[0]) : undefined
}

interface WordMatch<T> { word: string; value: T; index: number; end: number }

/** All non-overlapping matches in text order; longer words win at overlaps ("south korean" over "korean"). */
function findAll<T>(text: string, entries: Array<[string, T]>, pattern: (word: string) => RegExp): WordMatch<T>[] {
  const matches: WordMatch<T>[] = []
  for (const [word, value] of entries) {
    const regex = pattern(word)
    for (const match of text.matchAll(new RegExp(regex.source, 'g'))) {
      matches.push({ word, value, index: match.index!, end: match.index! + match[0].length })
    }
  }
  matches.sort((a, b) => a.index - b.index || b.word.length - a.word.length)
  return matches.filter((match, i) => !matches.some((other, j) =>
    j !== i && other.index <= match.index && other.end >= match.end && other.word.length > match.word.length
  ))
}

function pushUnique(list: OriginConstraint[], item: OriginConstraint) {
  if (!list.some(existing => existing.code === item.code)) list.push(item)
}

export interface OriginLists {
  languages: OriginConstraint[]
  countries: OriginConstraint[]
}

const COUNTRY_LIST_SPLIT = /\s*(?:,|&|\band\b|\bor\b|\bplus\b)\s*/

/**
 * Every origin mentioned in (one turn of) request text, in order. A language and
 * a country can both apply ("Tamil films from Malaysia"), and lists are kept
 * ("Malaysian and Indonesian films", "movies from Malaysia or Indonesia").
 */
export function resolveOriginLists(text: string): OriginLists {
  const lower = text.toLowerCase()
  const result: OriginLists = { languages: [], countries: [] }

  const languages = findAll(lower, Object.entries(LANGUAGE_CODES), word =>
    LANGUAGE_FIRST.has(word) || word.includes(' ')
      ? new RegExp(`\\b${escapeRegExp(word)}(?:-language)?\\b`)
      // Language-only names that double as demonyms need explicit language framing.
      : new RegExp(`\\b(?:in\\s+${escapeRegExp(word)}|${escapeRegExp(word)}[-\\s]language)\\b`)
  )
  for (const match of languages) {
    pushUnique(result.languages, { code: match.value, name: titleCase(match.word) })
  }

  const demonyms = findAll(
    lower,
    Object.entries(COUNTRY_DEMONYMS).filter(([word]) => !LANGUAGE_FIRST.has(word)),
    // Skip reference titles such as "like American Beauty" or "The Mexican".
    word => new RegExp(`(?<!\\b(?:like|than|as|to|the|latin|south|north|central)\\s)\\b${escapeRegExp(word)}\\b(?![-\\s]language)`)
  )
  for (const match of demonyms) {
    // "films in Vietnamese" is the language, not the country.
    if (match.word in LANGUAGE_CODES && /\bin\s+$/.test(lower.slice(0, match.index))) continue
    pushUnique(result.countries, {
      code: match.value,
      name: /wood$/.test(match.word) ? demonymForCountry(match.value) || titleCase(match.word) : titleCase(match.word)
    })
  }

  const countryCue = /\b(?:from|made in|produced in|out of|about|include|including|add|adding|plus|also)\s+(?:the\s+)?([a-z.\u00c0-\u024f' ,&-]{2,80})/g
  for (const match of lower.matchAll(countryCue)) {
    for (const segment of match[1].split(COUNTRY_LIST_SPLIT)) {
      const words = segment.trim()
        .replace(/^(?:(?:also|add|adding|include|including|plus|from|films?|movies?|shows?|series|the)\s+)+/, '')
        .split(/\s+/)
      let code: string | undefined
      let candidate = ''
      for (let length = Math.min(4, words.length); length >= 1 && !code; length--) {
        candidate = words.slice(0, length).join(' ').replace(/[.,!?]+$/, '')
        code = getCountryNameIndex().get(candidate) || getCountryNameIndex().get(`the ${candidate}`)
      }
      // A list ends at the first segment that is not a country ("from Malaysia and something funny").
      if (!code) break
      pushUnique(result.countries, { code, name: demonymForCountry(code) || titleCase(candidate) })
    }
  }

  return result
}

/** First language and country mentioned in the text. */
export function resolveOriginConstraints(text: string): {
  originalLanguage?: OriginConstraint
  originCountry?: OriginConstraint
} {
  const { languages, countries } = resolveOriginLists(text)
  const result: { originalLanguage?: OriginConstraint; originCountry?: OriginConstraint } = {}
  if (languages[0]) result.originalLanguage = languages[0]
  if (countries[0]) result.originCountry = countries[0]
  return result
}

const ADDITIVE_CUE = /\b(?:too|also|as well|additionally|plus|add|adding|include|including|along with|alongside|together with|and)\b/
const SWITCH_CUE = /\b(?:what about|how about|instead|switch to|rather|only)\b/

function languageAsCountry(language: OriginConstraint): OriginConstraint | undefined {
  const word = language.name.toLowerCase()
  const code = LANGUAGE_HOME_COUNTRY[word] || COUNTRY_DEMONYMS[word]
  return code ? { code, name: demonymForCountry(code) || language.name } : undefined
}

function countryAsLanguage(country: OriginConstraint): OriginConstraint | undefined {
  const code = LANGUAGE_CODES[country.name.toLowerCase()]
  return code ? { code, name: country.name } : undefined
}

export interface ConversationOrigins extends OriginLists {
  /** How the latest turn changed the active origins, if it mentioned any. */
  change?: 'added' | 'replaced' | 'narrowed'
  /** Plain-English summary of the change, e.g. "Added Indonesian alongside Malaysian." */
  changeNote?: string
}

/**
 * Merge origins across user turns (oldest first). A turn that names origins with
 * an additive cue ("What about Indonesian films too?") extends the active set;
 * otherwise it replaces origins of the same kind. Additions of a different kind
 * are normalised to one kind so "Malaysian films" + "Korean ones too" means
 * Malaysia OR Korea rather than Korean-language Malaysian films.
 */
export function resolveConversationOrigins(turns: string[]): ConversationOrigins {
  let languages: OriginConstraint[] = []
  let countries: OriginConstraint[] = []
  let change: ConversationOrigins['change']
  let changeNote: string | undefined

  turns.forEach((turn, index) => {
    const found = resolveOriginLists(turn)
    const isLatest = index === turns.length - 1
    if (found.languages.length === 0 && found.countries.length === 0) {
      if (isLatest) {
        change = undefined
        changeNote = undefined
      }
      return
    }

    const lower = turn.toLowerCase()
    const hadOrigins = languages.length + countries.length > 0
    const additive = hadOrigins && ADDITIVE_CUE.test(lower) && !/\b(?:instead|rather than|only)\b/.test(lower)

    if (additive) {
      const previous = [...countries, ...languages]
      let newLanguages = found.languages
      let newCountries = found.countries
      if (countries.length > 0 && newCountries.length === 0) {
        const mapped = newLanguages.map(languageAsCountry)
        if (mapped.every(Boolean)) {
          newCountries = mapped as OriginConstraint[]
          newLanguages = []
        }
      } else if (languages.length > 0 && newLanguages.length === 0 && countries.length === 0) {
        const mapped = newCountries.map(countryAsLanguage)
        if (mapped.every(Boolean)) {
          newLanguages = mapped as OriginConstraint[]
          newCountries = []
        } else {
          const existing = languages.map(languageAsCountry)
          if (existing.every(Boolean)) {
            countries = existing as OriginConstraint[]
            languages = []
          }
        }
      }
      const added = [...newCountries, ...newLanguages].filter(item => !previous.some(existing => existing.code === item.code))
      newLanguages.forEach(item => pushUnique(languages, item))
      newCountries.forEach(item => pushUnique(countries, item))
      if (isLatest) {
        change = 'added'
        changeNote = added.length > 0
          ? `Added ${joinOriginNames(added)} alongside ${joinOriginNames(previous)}.`
          : undefined
      }
      return
    }

    // A fresh "what about X?" switches origin entirely; otherwise a new kind narrows ("Tamil films" + "from Malaysia").
    const switching = SWITCH_CUE.test(lower)
    const replacesExisting = switching ||
      (found.languages.length > 0 && languages.length > 0) ||
      (found.countries.length > 0 && countries.length > 0)
    if (found.languages.length > 0 || switching) languages = found.languages
    if (found.countries.length > 0 || switching) countries = found.countries
    if (isLatest && hadOrigins) {
      change = replacesExisting ? 'replaced' : 'narrowed'
      changeNote = replacesExisting
        ? `Switched to ${joinOriginNames([...countries, ...languages])}.`
        : `Narrowed to ${joinOriginNames([...countries, ...languages])}.`
    }

  })

  return { languages, countries, change, changeNote }
}

/** Human-readable list: "Malaysian and Indonesian", "Korean, Japanese or Thai". */
export function joinOriginNames(items: OriginConstraint[], conjunction = 'and'): string | undefined {
  if (items.length === 0) return undefined
  if (items.length === 1) return items[0].name
  return `${items.slice(0, -1).map(item => item.name).join(', ')} ${conjunction} ${items[items.length - 1].name}`
}
