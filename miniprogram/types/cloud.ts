// 向后兼容：按域拆分为 cloud-user / cloud-daily / cloud-report，此处统一 re-export。
// 新代码建议直接从对应域的模块导入。

export {
  USER_CLOUD_FUNCTION,
  type UserCloudResult,
  type PartnerBindInboundItem,
  type PartnerOutboundPendingItem,
  type PartnerPanelCloudResult,
  type PartnerActionVoidCloudResult,
  type SetTogetherSinceCloudResult,
  type TempFileUrlsCloudResult,
  type AvatarTempUrlsCloudResult,
} from './cloud-user'

export {
  DAILY_CLOUD_FUNCTION,
  type DailyPostPublic,
  type DailyListCloudResult,
  type DailyPostCloudResult,
  type DailyVoidCloudResult,
  type DailyCommentPublic,
  type DailyListCommentsCloudResult,
  type DailyAddCommentCloudResult,
  type DailyUpdateCommentCloudResult,
  type DailyMediaTempUrlsCloudResult,
} from './cloud-daily'

export {
  REPORT_CLOUD_FUNCTION,
  type ReportPartnerState,
  type ReportPostPublic,
  type ReportListCloudResult,
  type ReportPostCloudResult,
  type ReportTagsCloudResult,
  type ReportVoidCloudResult,
  type ReportMediaTempUrlsCloudResult,
} from './cloud-report'
