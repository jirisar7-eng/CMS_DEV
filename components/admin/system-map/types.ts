import {
  SystemMapAccessLevel,
  BasicCapabilityRecord,
  BasicSystemMap,
  InternalCapabilityRecord,
  InternalTaskRecord,
  InternalSystemMap,
  CapabilityVisibility,
} from '@/lib/domain/system-map/types';

export type {
  SystemMapAccessLevel,
  BasicCapabilityRecord,
  BasicSystemMap,
  InternalCapabilityRecord,
  InternalTaskRecord,
  InternalSystemMap,
  CapabilityVisibility,
};

export type SystemMapViewTab = 'overview' | 'capabilities' | 'lineage' | 'graph';

export interface SystemMapFilterState {
  searchQuery: string;
  visibilityFilter: CapabilityVisibility | 'ALL';
  selectedCapabilityId: string | null;
  activeTab: SystemMapViewTab;
}

export interface SystemMapUIState {
  accessLevel: SystemMapAccessLevel;
  loading: boolean;
  error: string | null;
  data: BasicSystemMap | InternalSystemMap | null;
  filter: SystemMapFilterState;
}

export interface SystemMapCardProps {
  capability: BasicCapabilityRecord | InternalCapabilityRecord;
  accessLevel: SystemMapAccessLevel;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

export interface SystemMapDetailModalProps {
  capability: BasicCapabilityRecord | InternalCapabilityRecord | null;
  accessLevel: SystemMapAccessLevel;
  onClose: () => void;
}
