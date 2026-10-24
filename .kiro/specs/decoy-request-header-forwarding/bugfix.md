# Bugfix Requirements Document

## Introduction

This bugfix closes a requirements-artifact gap for Decoy request-header forwarding. Decoy-routed requests currently lose client inbound headers that the Gateway is required to preserve, preventing the Decoy from observing request context such as `user-agent`, `content-type`, `authorization`, and `cookie`. The correction aligns with the existing siren-gateway Requirements 1.2, 2.2, 2.3, and 2.4: client-supplied session identity and transport-specific headers remain excluded, the Gateway-computed session identity remains authoritative, and transparent proxy behavior outside request-header forwarding remains unchanged.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a request is routed to the Decoy and contains at least one defined inbound header outside the case-insensitive exclusion set of `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `proxy-authorization`, `te`, `trailer`, `host`, `content-length`, and `x-siren-session` THEN the system omits that forwardable header from the Decoy-bound request.

1.2 WHEN a Decoy-routed request contains `user-agent`, `content-type`, `authorization`, or `cookie` THEN the system does not forward those Node-observed inbound header values to the Decoy.

1.3 WHEN a Decoy-routed request contains forwardable inbound headers together with a forged `x-siren-session` value THEN the system replaces the forged session value with the Gateway-computed session ID but still loses the forwardable inbound headers.

### Expected Behavior (Correct)

2.1 WHEN a request is routed to the Decoy THEN the system SHALL forward every defined Node-observed inbound header with its value unchanged except headers whose names case-insensitively equal `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `proxy-authorization`, `te`, `trailer`, `host`, `content-length`, or `x-siren-session`.

2.2 WHEN a Decoy-routed request contains `user-agent`, `content-type`, `authorization`, or `cookie` THEN the system SHALL forward each defined Node-observed value unchanged to the Decoy.

2.3 WHEN a Decoy-routed request contains forwardable inbound headers together with a forged `x-siren-session` value THEN the system SHALL forward the allowed headers, SHALL omit the forged `x-siren-session` value, and SHALL set `x-siren-session` to the Gateway-computed session ID in accordance with siren-gateway Requirements 1.2, 2.2, and 2.3.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any inbound request supplies `x-siren-session` THEN the system SHALL CONTINUE TO remove the client-supplied value and use the Gateway-computed session ID as the authoritative value.

3.2 WHEN a request is routed to the Decoy THEN the system SHALL CONTINUE TO forward the request method, path including its query string, and body according to siren-gateway Requirement 2.2, including continuing to omit a request body for methods whose existing proxy behavior omits one.

3.3 WHEN the Decoy returns a response THEN the system SHALL CONTINUE TO proxy the Decoy response status, forwardable response headers, and body to the client according to siren-gateway Requirement 2.4.

3.4 WHEN the Gateway evaluates and routes a request THEN the system SHALL CONTINUE TO preserve existing Decoy-versus-Maze routing decisions and the current-request routing transition behavior.

3.5 WHEN a request completes THEN the system SHALL CONTINUE TO preserve existing telemetry emission, route attribution, session history, scoring, burn accounting, prediction, WebSocket streaming, and replay behavior.

3.6 WHEN a Decoy request times out or fails THEN the system SHALL CONTINUE TO preserve the existing timeout, error response, and telemetry behavior.

3.7 WHEN a request is routed to the Maze THEN the system SHALL CONTINUE TO preserve Maze request construction, Maze response handling, Maze failures, and all other Maze behavior without applying Decoy request-header forwarding to that route.
