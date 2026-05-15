import yaml from 'js-yaml'
import type { Card, CardsYamlFile } from '../types/card'
import type { Drink, DrinksYamlFile } from '../types/drink'
import type { CardCustomizationsFile, CardCustomizationOption } from '../types/customization'

const BASE = import.meta.env.BASE_URL

async function fetchYaml<T>(path: string): Promise<T> {
  const url = `${BASE}data/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const text = await res.text()
  return yaml.load(text) as T
}

/**
 * Data/AnomalyCards/{free,anomaly,trouble,pidol}_cards.yaml をすべて読み込み、結合して返す。
 * カードIDは全カテゴリで一意 (com_F_*, com_A_*, com_T_*, <Char>_*, SP_*)。
 */
export async function loadAllCards(): Promise<Card[]> {
  const files = ['free_cards.yaml', 'anomaly_cards.yaml', 'trouble_cards.yaml', 'pidol_cards.yaml']
  const results: Card[] = []
  for (const file of files) {
    try {
      const data = await fetchYaml<CardsYamlFile>(file)
      if (data?.cards) {
        results.push(...data.cards)
      }
    } catch (e) {
      console.warn(`YAML読み込み失敗 (${file}):`, e)
    }
  }
  return results
}

/** drinks.yaml を読み込み Drink[] を返す */
export async function loadAllDrinks(): Promise<Drink[]> {
  try {
    const data = await fetchYaml<DrinksYamlFile>('drinks.yaml')
    return data?.drinks ?? []
  } catch (e) {
    console.warn('YAML読み込み失敗 (drinks.yaml):', e)
    return []
  }
}

/** customizations.yaml を読み込み {cardId: options[]} を返す */
export async function loadAllCustomizations(): Promise<Record<string, CardCustomizationOption[]>> {
  try {
    const data = await fetchYaml<CardCustomizationsFile>('customizations.yaml')
    const out: Record<string, CardCustomizationOption[]> = {}
    if (data?.customizations) {
      for (const [cardId, entry] of Object.entries(data.customizations)) {
        out[cardId] = entry.options
      }
    }
    return out
  } catch (e) {
    console.warn('YAML読み込み失敗 (customizations.yaml):', e)
    return {}
  }
}
