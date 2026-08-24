// https://tenant-name.openai.azure.com/openai/deployments/chat
const suffixSpoof = "https://tenant-name.openai.azure.com.attacker.example";
const literal = "openai.azure.com";
const ordinaryAzureService = "https://tenant-name.cognitiveservices.azure.com";

export { suffixSpoof, literal, ordinaryAzureService };
