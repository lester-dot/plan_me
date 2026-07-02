import type { Competency, Discipline, Evidence, Link } from "../db/schema.js";

// Легковесные наборы данных для доменных расчётов.
export interface DomainData {
  competencies: Competency[];
  disciplines: Discipline[];
  links: Link[];
  evidence: Evidence[];
}
