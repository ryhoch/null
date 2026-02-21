// WebRTC globals must be registered BEFORE any other imports that use them
import "./src/p2p/webrtc-shim";

import React from "react";
import { SafeAreaView, Text, StyleSheet } from "react-native";

/**
 * Null — Decentralized encrypted messaging
 *
 * This is the entry point for the React Native app.
 * Screen routing, wallet initialization, and peer connection setup
 * will be wired up here as screens are built out.
 */
export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Null</Text>
      <Text style={styles.subtitle}>Decentralized. Encrypted. Private.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0a0a",
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666666",
    marginTop: 8,
    letterSpacing: 2,
  },
});
