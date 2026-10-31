import { createEditStaging } from './edit-staging'
import type { EditStagingPayload } from './edit-staging'

/** 编辑报备：跳转前写入、编辑页读出并清除 */

export type ReportEditStagingPayload = EditStagingPayload

const staging = createEditStaging('moilike_report_compose_edit_staging')

export const setReportEditStaging = staging.set
export const takeReportEditStaging = staging.take
