import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import axios from "axios";

type NodeState = {
  killed: boolean;
  x: Value | null; // Accepte null uniquement ici
  decided: boolean | null;
  k: number;
};


type Message = {
  sender: number;
  value: Value | "?";
  step: number;
};

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

  // ✅ État du nœud
  let state: NodeState = {
    killed: false,
    x: initialValue,
    decided: false,
    k: 0,
  };

  if (isFaulty) {
    state = {
      killed: false,
      x: null,
      decided: null,
      k: 0,
    };
  }

  const messages: Message[] = [];
  let receivedMessagesCount = 0;

  // ✅ Route pour obtenir le statut du nœud
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // ✅ Route pour récupérer l'état du nœud
  node.get("/getState", (req, res) => {
    res.status(200).json(state);
  });

  // ✅ Route pour recevoir les messages des autres nœuds
  node.post("/message", (req, res) => {
    const message: Message = req.body;
    console.log(`📩 [Node ${nodeId}] Received from ${message.sender}: ${message.value}`);
    
    messages.push(message);
    receivedMessagesCount++;

    // Vérifier si tous les messages nécessaires sont reçus
    if (receivedMessagesCount >= N - F) {
      decideValue();
    }

    res.status(200).send("Message received");
  });

  // ✅ Route pour démarrer le consensus
  node.get("/start", async (req, res) => {
    if (state.killed) {
      res.status(500).send("Node is killed");
      return;
    }

    // Attendre que tous les nœuds soient prêts
    while (!nodesAreReady()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`🚀 [Node ${nodeId}] Starting Consensus at Step ${state.k}`);

    // 🔹 Phase de Proposition
    await broadcastMessage(state.x ?? "?");


    res.status(200).send("Consensus algorithm started");
  });

  // ✅ Route pour arrêter le consensus
  node.get("/stop", (req, res) => {
    state.killed = true;
    res.status(200).send("Node stopped");
  });

  // ✅ Envoi de messages à tous les autres nœuds
  async function broadcastMessage(value: Value | "?") {
    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        try {
          await axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            sender: nodeId,
            value,
            step: state.k,
          });
        } catch (error) {
          console.error(`❌ [Node ${nodeId}] Failed to send to Node ${i}:`, error);
        }
      }
    }
  }

  // ✅ Processus de décision après réception des messages
  function decideValue() {
    if (state.decided) return;

    // 🔹 Phase de Collecte
    const values: Value[] = messages.map((msg) => msg.value as Value).filter((v) => v !== "?");

    // 🔹 Comptage des votes
    const count0 = values.filter((v) => v === 0).length;
    const count1 = values.filter((v) => v === 1).length;

    console.log(`📊 [Node ${nodeId}] Round ${state.k}: 0s=${count0}, 1s=${count1}`);

    // 🔹 Phase de Décision
    if (count0 > F) {
      state.x = 0;
    } else if (count1 > F) {
      state.x = 1;
    } else {
      state.x = "?"; // Indécis
    }

    // 🔹 Phase de Diffusion
    broadcastMessage(state.x);

    // 🔹 Vérification du consensus
    if (count0 === N - F || count1 === N - F) {
      state.decided = true;
      console.log(`✅ [Node ${nodeId}] Consensus reached: ${state.x}`);
    } else {
      state.k++; // Passer à l'étape suivante si pas encore décidé
    }

    // Nettoyage pour le prochain round
    messages.length = 0;
    receivedMessagesCount = 0;
  }

  // ✅ Démarrage du serveur
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`🎧 [Node ${nodeId}] Listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
