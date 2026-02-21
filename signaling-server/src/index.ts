import { createSignalingServer } from "./server.js";

const PORT = Number(process.env["PORT"] ?? 4000);
const { httpServer } = createSignalingServer();

httpServer.listen(PORT, () => {
  console.log(`Null signaling server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
