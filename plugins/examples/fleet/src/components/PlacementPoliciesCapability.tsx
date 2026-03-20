/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Link, ResourceListView, SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useLocation } from 'react-router-dom';

type Props = {
  clusterPlacements: any[] | null;
  resourcePlacements: any[] | null;
  getPlacementScope: (item: any) => 'Cluster' | 'Namespace';
  getPlacementPolicyType: (item: any) => string;
  getPlacementStrategyType: (item: any) => 'RollingUpdate' | 'External';
  getPlacementStatusDisplay: (item: any) => {
    label: string;
    status: 'success' | 'warning' | 'error' | '';
    detailedStatus: string;
  };
  makePlacementStatusLabel: (item: any) => React.ReactNode;
};

export function PlacementPoliciesCapability({
  clusterPlacements,
  resourcePlacements,
  getPlacementScope,
  getPlacementPolicyType,
  getPlacementStrategyType,
  getPlacementStatusDisplay,
  makePlacementStatusLabel,
}: Props) {
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const selectedName = searchParams.get('selectedName') || '';
  const selectedKind = searchParams.get('selectedKind') || '';
  const selectedVersion = searchParams.get('selectedVersion') || '';
  const selectedGroup = searchParams.get('selectedGroup') || '';
  const selectedNamespace = searchParams.get('selectedNamespace') || '';
  const hasSelectorFilter = !!(selectedName && selectedKind && selectedVersion);
  const selectorApiVersion = selectedGroup
    ? `${selectedGroup}/${selectedVersion}`
    : selectedVersion;
  const selectorScope = selectedNamespace
    ? `namespace ${selectedNamespace}`
    : 'all namespaces/cluster-scoped resources';

  const mergedPlacements =
    clusterPlacements && resourcePlacements ? [...clusterPlacements, ...resourcePlacements] : null;

  const filteredPlacements =
    mergedPlacements?.filter(item => {
      if (!hasSelectorFilter) {
        return true;
      }

      const selectors = item?.jsonData?.spec?.resourceSelectors;
      if (!Array.isArray(selectors) || selectors.length === 0) {
        return false;
      }

      return selectors.some((selector: any) => {
        if ((selector?.name || '') !== selectedName) {
          return false;
        }

        if ((selector?.kind || '') !== selectedKind) {
          return false;
        }

        if ((selector?.version || '') !== selectedVersion) {
          return false;
        }

        if ((selector?.group || '') !== selectedGroup) {
          return false;
        }

        if (selectedNamespace && selector?.namespace && selector.namespace !== selectedNamespace) {
          return false;
        }

        return true;
      });
    }) ?? null;

  return (
    <>
      {hasSelectorFilter && (
        <SectionBox title="Active Filter">
          <Typography variant="body2">
            Showing only placement policies that select <strong>{selectedKind}</strong>{' '}
            <strong>{selectedName}</strong> ({selectorApiVersion}) within {selectorScope}.
          </Typography>
          <Box mt={1}>
            <Link routeName="fleet-placement-policies">Clear filter</Link>
          </Box>
        </SectionBox>
      )}
      <ResourceListView
        title="Placement Policies"
        data={filteredPlacements}
        columns={[
          {
            label: 'Name',
            getValue: (item: any) => item.getName(),
            render: (item: any) => {
              const scope = getPlacementScope(item);
              const name = item.getName();
              const namespace = item.getNamespace?.();
              const params =
                scope === 'Namespace' && namespace
                  ? { scope: 'namespace', namespace, placementName: name }
                  : { scope: 'cluster', placementName: name };
              const routeName =
                scope === 'Namespace' && namespace
                  ? 'fleet-placement-policy-details-namespace'
                  : 'fleet-placement-policy-details-cluster';

              return (
                <Link routeName={routeName} params={params}>
                  {name}
                </Link>
              );
            },
          },
          {
            label: 'Scope',
            getValue: (item: any) => item.getNamespace?.() || 'Cluster',
            render: (item: any) => {
              const namespace = item.getNamespace?.();

              if (!namespace) {
                return 'Cluster';
              }

              return (
                <Link
                  routeName="namespace"
                  params={{ name: namespace }}
                  activeCluster={item.cluster}
                >
                  {namespace}
                </Link>
              );
            },
          },
          {
            label: 'Policy',
            getValue: (item: any) => getPlacementPolicyType(item),
          },
          {
            label: 'Scheduling Status',
            getValue: (item: any) => getPlacementStatusDisplay(item).label,
            render: (item: any) => makePlacementStatusLabel(item),
          },
          {
            label: 'Rollout Strategy',
            getValue: (item: any) => getPlacementStrategyType(item),
          },
        ]}
      />
    </>
  );
}
