export { hashPassword, verifyPapPassword } from "./pap";
export { verifyChapPassword } from "./chap";
export type { VerifyChapPasswordInput } from "./chap";
export { generateNtResponse, verifyMsChapV2Response } from "./mschapv2";
export type { GenerateNtResponseInput, VerifyMsChapV2Input } from "./mschapv2";

export {
  authenticatePap,
  authenticateChap,
  authenticateMsChapV2,
} from "./auth";
export type {
  RadiusAuthResult,
  RadiusAuthAccept,
  RadiusAuthReject,
  PapAuthRequest,
  ChapAuthRequest,
  MsChapV2AuthRequest,
} from "./auth";

export {
  handleAccountingStart,
  handleAccountingUpdate,
  handleAccountingStop,
} from "./accounting";
export type {
  AccountingStartRequest,
  AccountingUpdateRequest,
  AccountingUpdateResult,
  AccountingStopRequest,
} from "./accounting";

export { RadiusControlClient } from "./control";
export type { RadiusControlClientOptions, RadiusControlResult } from "./control";

export {
  RadiusProtocolError,
  encodeRadiusAttributes,
  encodeRadiusPacket,
  parseRadiusAttributes,
  parseRadiusResponse,
  verifyRadiusResponseAuthenticator,
  buildControlPacket,
} from "./protocol";
export type { RadiusAttribute, RadiusPacket, ParsedRadiusAttribute } from "./protocol";
