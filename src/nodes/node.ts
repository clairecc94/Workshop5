import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let killed = false;
  let x: 0 | 1 | "?" | null = isFaulty ? null : initialValue;
  let decided: boolean | null = isFaulty ? null : false;
  let k: number | null = isFaulty ? null : 0;

  // ✅ Route pour vérifier l'état du nœud
  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  // ✅ Route pour récupérer l'état du nœud
  node.get("/getState", (req, res) => {
    res.json({ killed, x, decided, k });
  });

  // ✅ Route pour recevoir des messages des autres nœuds
  node.post("/message", (req, res) => {
    if (isFaulty || killed) {
      return res.status(400).json({ error: "Node is faulty or stopped" });
    }

    const { senderId, value } = req.body;

    console.log(`Node ${nodeId} received message from Node ${senderId}:`, value);
    
    // Traitement du message (simplifié, devra être amélioré avec l'algorithme Ben-Or)
    if (typeof value === "number" && (value === 0 || value === 1)) {
      x = value;
    }

    return res.status(200).json({ message: "Message received" });
  });

  // ✅ Route pour démarrer le consensus
  node.get("/start", async (req, res) => {
    if (isFaulty || killed) {
      return res.status(400).json({ error: "Node is faulty or stopped" });
    }

    console.log(`Node ${nodeId} is starting the consensus process...`);

    // Simulation de démarrage du consensus (à améliorer avec Ben-Or)
    decided = false;
    k = 0;

    return res.status(200).json({ message: "Consensus started" });
  });

  // ✅ Route pour arrêter le consensus
  node.get("/stop", async (req, res) => {
    killed = true;
    res.status(200).json({ message: "Consensus stopped" });
  });

  // ✅ Démarrer le serveur
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
