import React from 'react';
import {
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticStarSystemResult,
  SelectedMapEntity,
} from '../types';
import { StarDossierModal } from './StarDossierModal';
import { BinarySplitModal } from './BinarySplitModal';
import { BeltDossierModal } from './BeltDossierModal';
import { PlanetDossierModal } from './PlanetDossierModal';
import {
  SectorEmpire,
  ColonyDesignation,
} from '../../../core/generation/empireGen';
import { PlanetarySurfaceTarget } from '../../surface/PlanetarySurfaceApp';

export interface EntityDossierRouterModalProps {
  selectedEntity: SelectedMapEntity | null;
  systemResult: RealisticStarSystemResult | null;
  onSelectEntity: (entity: SelectedMapEntity | null) => void;
  onTrackInOrrery?: (entity: SelectedMapEntity) => void;
  onOpenPreProgramStars?: () => void;
  onClose: () => void;
  currentEmpire?: SectorEmpire | null;
  sectorEmpires?: SectorEmpire[];
  getPlanetClaimInfo?: (
    planet: RealisticPlanetBody,
    zoneIdx: number,
    bodyIdx: number
  ) => {
    empire: SectorEmpire;
    key: string;
    designation: ColonyDesignation;
  } | null;
  onToggleClaimPlanet?: (
    planet: RealisticPlanetBody,
    zoneIdx: number,
    bodyIdx: number,
    designation?: ColonyDesignation,
    empireId?: string
  ) => void;
  onOpenSurfaceGen?: (target: PlanetarySurfaceTarget) => void;
}

export const EntityDossierRouterModal: React.FC<EntityDossierRouterModalProps> = React.memo(({
  selectedEntity,
  systemResult,
  onSelectEntity,
  onTrackInOrrery,
  onOpenPreProgramStars,
  onClose,
  currentEmpire,
  sectorEmpires,
  getPlanetClaimInfo,
  onToggleClaimPlanet,
  onOpenSurfaceGen,
}) => {
  if (!selectedEntity || !systemResult) return null;

  // 1. Star Dossier Blow-Up
  if (selectedEntity.kind === 'star') {
    const st = systemResult.hierarchy.stars[selectedEntity.starIdx];
    if (!st) return null;
    return (
      <StarDossierModal
        star={st}
        starIdx={selectedEntity.starIdx}
        systemResult={systemResult}
        onSelectStar={(idx) => onSelectEntity({ kind: 'star', starIdx: idx })}
        onTrackInOrrery={(idx) => {
          onTrackInOrrery?.({ kind: 'star', starIdx: idx });
        }}
        onOpenPreProgramStars={onOpenPreProgramStars}
        onClose={onClose}
      />
    );
  }

  // 2. Binary Split Dossier Blow-Up
  if (selectedEntity.kind === 'split') {
    const sp = systemResult.hierarchy.splits[selectedEntity.splitIdx];
    if (!sp) return null;
    return (
      <BinarySplitModal
        split={sp}
        onClose={onClose}
      />
    );
  }

  // 3. Belt Dossier Blow-Up
  if (selectedEntity.kind === 'belt') {
    const zone = systemResult.zones[selectedEntity.zoneIdx];
    const belt = zone?.bodies[selectedEntity.bodyIdx] as RealisticBeltBody | undefined;
    if (!zone || !belt || belt.kind !== 'belt') return null;
    return (
      <BeltDossierModal
        belt={belt}
        bodyIdx={selectedEntity.bodyIdx}
        zone={zone}
        onClose={onClose}
      />
    );
  }

  // 4. Planet & Moon Dossier Modal
  if (selectedEntity.kind === 'planet' || selectedEntity.kind === 'moon') {
    const hostPlanet = systemResult.zones[selectedEntity.zoneIdx]?.bodies[selectedEntity.bodyIdx] as RealisticPlanetBody | undefined;
    const claimInfo = (hostPlanet && getPlanetClaimInfo)
      ? getPlanetClaimInfo(hostPlanet, selectedEntity.zoneIdx, selectedEntity.bodyIdx)
      : null;

    return (
      <PlanetDossierModal
        selectedEntity={selectedEntity}
        systemResult={systemResult}
        onSelectEntity={onSelectEntity}
        onTrackInOrrery={(ent) => {
          onTrackInOrrery?.(ent);
        }}
        onClose={onClose}
        currentEmpire={currentEmpire}
        sectorEmpires={sectorEmpires}
        planetClaimInfo={claimInfo}
        onToggleClaimPlanet={(des, empId) => {
          if (hostPlanet && onToggleClaimPlanet) {
            onToggleClaimPlanet(hostPlanet, selectedEntity.zoneIdx, selectedEntity.bodyIdx, des, empId);
          }
        }}
        onOpenSurfaceGen={onOpenSurfaceGen}
      />
    );
  }

  return null;
});

EntityDossierRouterModal.displayName = 'EntityDossierRouterModal';
