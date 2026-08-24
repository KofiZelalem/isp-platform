import { startHeartbeatReporter, startNetworkAgent } from "./index";

// Separated from index.ts so importing this module's exports (e.g. from tests or other
// packages) never has the side effect of starting an HTTP server or heartbeat timer.
void startNetworkAgent();
startHeartbeatReporter();
