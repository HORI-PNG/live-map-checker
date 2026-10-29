import { getRouteApi } from '@tanstack/react-router'

const rootRoute = getRouteApi('__root__')

/** 日本地図のタイル用の地方一覧（ルートの loader で読んだもの） */
export function useRegionSummaries() {
  return rootRoute.useLoaderData().regions
}
