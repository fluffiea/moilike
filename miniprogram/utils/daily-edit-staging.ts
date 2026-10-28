import { createEditStaging } from './edit-staging'
import type { EditStagingPayload } from './edit-staging'

/** 编辑日常：跳转前写入、编辑页 onLoad/ready 读出并清除（不依赖 EventChannel 时序） */

export type DailyEditStagingPayload = EditStagingPayload

const staging = createEditStaging('moilike_daily_compose_edit_staging')

export const setDailyEditStaging = staging.set
export const takeDailyEditStaging = staging.take
