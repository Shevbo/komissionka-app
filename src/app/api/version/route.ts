/**
 * GET: версии приложения, агента и телеграм-бота (X.Y.Z).
 * Единый источник правды — корневой version.json через komiss/lib/versions.
 */
import { NextResponse } from "next/server";
import { getAppVersion, getAgentVersion, getTgbotVersion } from "komiss/lib/versions";

export function GET() {
  return NextResponse.json({
    app: getAppVersion(),
    agent: getAgentVersion(),
    tgbot: getTgbotVersion(),
  });
}
