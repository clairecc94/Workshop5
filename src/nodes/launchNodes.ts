import { Value } from "../types";
import { node } from "./node";

export async function launchNodes(
  N: number, // Nombre total de nœuds
  F: number, // Nombre de nœuds défectueux
  initialValues: Value[], // Valeurs initiales de chaque nœud
  faultyList: boolean[] // Liste des nœuds défectueux
) {
  if (initialValues.length !== faultyList.length || N !== initialValues.length)
    throw new Error("⚠️ Arrays don't match");
  if (faultyList.filter((el) => el === true).length !== F)
    throw new Error("⚠️ faultyList doesn't have F faulties");

  const promises = [];
  const nodesStates = new Array(N).fill(false);

  function nodesAreReady() {
    return nodesStates.find((el) => el === false) === undefined;
  }

  function setNodeIsReady(index: number) {
    nodesStates[index] = true;
    console.log(`✅ Node ${index} is ready`);
  }

  console.log("🚀 Launching nodes...");
  console.log(`🌍 Total Nodes: ${N}, Faulty Nodes: ${F}`);

  for (let index = 0; index < N; index++) {
    console.log(
      `📌 Launching Node ${index} | Initial Value: ${initialValues[index]} | Faulty: ${faultyList[index]}`
    );
    const newPromise = node(
      index,
      N,
      F,
      initialValues[index],
      faultyList[index],
      nodesAreReady,
      setNodeIsReady
    );
    promises.push(newPromise);
  }

  const servers = await Promise.all(promises);
  console.log("✅ All nodes are up and running!");
  
  return servers;
}
