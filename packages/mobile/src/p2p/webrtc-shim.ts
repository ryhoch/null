/**
 * React Native WebRTC global registration.
 *
 * Import this file ONCE, at the very top of App.tsx (before any other imports),
 * to register react-native-webrtc globals so that @null/core/p2p can use
 * RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, etc.
 *
 * IMPORTANT: This must be the first import in App.tsx — order matters.
 *
 * @example
 * // App.tsx
 * import './src/p2p/webrtc-shim'; // Must be first
 * import React from 'react';
 * // ...rest of imports
 */
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  MediaStreamTrack,
  registerGlobals,
} from "react-native-webrtc";

// Register all RN WebRTC globals into the React Native JS runtime
registerGlobals();

// Explicitly assign to globalThis for libraries that check window.RTCPeerConnection
const g = globalThis as Record<string, unknown>;
g["RTCPeerConnection"] = RTCPeerConnection;
g["RTCIceCandidate"] = RTCIceCandidate;
g["RTCSessionDescription"] = RTCSessionDescription;
g["MediaStream"] = MediaStream;
g["MediaStreamTrack"] = MediaStreamTrack;
