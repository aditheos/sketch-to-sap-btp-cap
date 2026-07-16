'use strict';

// ── Vision / Mermaid output ───────────────────────────────────────────────────

export interface RawComponent {
  id: string;
  label: string;
  rawType: string;
  description: string;
}

export interface RawConnection {
  fromId: string;
  toId: string;
  label: string;
}

export interface SketchArchitecture {
  title: string;
  components: RawComponent[];
  connections: RawConnection[];
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface DrawioStyle {
  fillColor: string;
  strokeColor: string;
  fontColor: string;
  shape?: string;
  width?: number;
  height?: number;
}

export interface CapMetadata {
  service_type: string;
  entity_type: string;
}

export interface BpmnMetadata {
  task_type: string;
}

export interface CatalogService {
  id: string;
  name: string;
  category: string;
  aliases?: string[];
  icon_id: string | null;
  render_zone: string | null;
  drawio: DrawioStyle;
  cap: CapMetadata;
  bpmn: BpmnMetadata;
  description?: string;
  btp_service_name?: string | null;
  typical_connections?: string[];
  is_actor?: boolean;
}

export interface CatalogData {
  version: string;
  description: string;
  services: CatalogService[];
}

// ── Mapper output ─────────────────────────────────────────────────────────────

export type MatchConfidence = 'exact' | 'alias' | 'type_fallback' | 'unknown';

export interface MappedComponent {
  id: string;
  label: string;
  rawType: string;
  description: string;
  sapServiceId: string | null;
  sapServiceName: string;
  category: string;
  drawio: DrawioStyle;
  cap: CapMetadata;
  bpmn: BpmnMetadata;
  confidence: MatchConfidence;
  iconId: string | null;
  renderZone: string | null;
}

export interface MappedConnection {
  fromId: string;
  toId: string;
  label: string;
}

export interface MappedArchitecture {
  title: string;
  components: MappedComponent[];
  connections: MappedConnection[];
}

// ── Validator output ──────────────────────────────────────────────────────────

export interface ValidationWarning {
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface ValidationResult {
  warnings: ValidationWarning[];
  missingServices: string[];
  summary: string;
}

// ── Icon index ────────────────────────────────────────────────────────────────

export interface IconEntry {
  base64_svg: string;
}

export type IconIndex = Record<string, IconEntry>;
