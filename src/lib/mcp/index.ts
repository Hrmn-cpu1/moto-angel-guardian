import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfile from "./tools/get_profile";
import listContacts from "./tools/list_contacts";
import addContact from "./tools/add_contact";
import listHistory from "./tools/list_history";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "moto-anjo-mcp",
  title: "Moto Anjo",
  version: "0.1.0",
  instructions: "Ferramentas do Moto Anjo: perfil, contatos de emergência e histórico de viagens/SOS do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, listContacts, addContact, listHistory],
});
