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

import { Icon } from '@iconify/react';
import { ApiProxy, K8s, registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import {
  DetailsGrid,
  LightTooltip,
  Link,
  Loader,
  ResourceListView,
  SectionBox,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const HUB_CLUSTER_STORAGE_KEY = 'fleet-plugin-hub-cluster';

// ─── Custom Resource Classes ──────────────────────────────────────────────────

/**
 * MemberCluster represents a cluster that has joined the fleet.
 * API: cluster.kubernetes-fleet.io/v1
 */
const MemberCluster = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'cluster.kubernetes-fleet.io', version: 'v1' }],
    kind: 'MemberCluster',
    pluralName: 'memberclusters',
    singularName: 'membercluster',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * ClusterResourcePlacement defines policies for placing resources across member clusters.
 * API: placement.kubernetes-fleet.io/v1beta1
 */
const ClusterResourcePlacement = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1beta1' }],
    kind: 'ClusterResourcePlacement',
    pluralName: 'clusterresourceplacements',
    singularName: 'clusterresourceplacement',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * ResourcePlacement defines namespace-scoped placement policies.
 * API: placement.kubernetes-fleet.io/v1beta1
 */
const ResourcePlacement = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1beta1' }],
    kind: 'ResourcePlacement',
    pluralName: 'resourceplacements',
    singularName: 'resourceplacement',
    isNamespaced: true,
  } // namespace-scoped
);

/**
 * ClusterStagedUpdateStrategy defines a staged rollout strategy for fleet updates.
 * API: placement.kubernetes-fleet.io/v1alpha1
 */
const ClusterStagedUpdateStrategy = makeCustomResourceClass(
  {
    apiInfo: [
      { group: 'placement.kubernetes-fleet.io', version: 'v1' },
      { group: 'placement.kubernetes-fleet.io', version: 'v1alpha1' },
    ],
    kind: 'ClusterStagedUpdateStrategy',
    pluralName: 'clusterstagedupdatestrategies',
    singularName: 'clusterstagedupdatestrategy',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * ClusterStagedUpdateRun tracks a staged rollout execution across the fleet.
 * API: placement.kubernetes-fleet.io/v1alpha1
 */
const ClusterStagedUpdateRun = makeCustomResourceClass(
  {
    apiInfo: [
      { group: 'placement.kubernetes-fleet.io', version: 'v1' },
      { group: 'placement.kubernetes-fleet.io', version: 'v1alpha1' },
    ],
    kind: 'ClusterStagedUpdateRun',
    pluralName: 'clusterstagedupdateruns',
    singularName: 'clusterstagedupdaterun',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * StagedUpdateRun tracks a staged rollout execution in a namespace.
 * API: placement.kubernetes-fleet.io/v1alpha1
 */
const StagedUpdateRun = makeCustomResourceClass(
  {
    apiInfo: [
      { group: 'placement.kubernetes-fleet.io', version: 'v1' },
      { group: 'placement.kubernetes-fleet.io', version: 'v1alpha1' },
    ],
    kind: 'StagedUpdateRun',
    pluralName: 'stagedupdateruns',
    singularName: 'stagedupdaterun',
    isNamespaced: true,
  } // namespace-scoped
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────

registerSidebarEntry({
  parent: null,
  name: 'fleet',
  label: 'KubeFleet Manager',
  url: '/fleet/member-clusters',
  icon: 'mdi:cargo-ship',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-configuration',
  label: 'Configure Plugin',
  url: '/fleet/configuration',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-member-clusters',
  label: 'Member Clusters',
  url: '/fleet/member-clusters',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-resource-overrides',
  label: 'Resource Overrides',
  url: '/fleet/resource-overrides',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-staged-resources',
  label: 'Staged Resources',
  url: '/fleet/staged-resources',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-placement-policies',
  label: 'Placement Policies',
  url: '/fleet/placement-policies',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-rollout-strategies',
  label: 'Staged Rollout Strategies',
  url: '/fleet/rollout-strategies',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-rollout-runs',
  label: 'Staged Rollout Runs',
  url: '/fleet/rollout-runs',
});

function getStoredHubCluster(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(HUB_CLUSTER_STORAGE_KEY) || '';
}

function persistHubCluster(clusterName: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HUB_CLUSTER_STORAGE_KEY, clusterName);
}

type FleetClusterInfo = {
  name: string;
  server: string;
};

function useFleetClusters() {
  const [clusters, setClusters] = useState<FleetClusterInfo[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    ApiProxy.request('/config', {}, false, false)
      .then((response: any) => {
        if (!mounted) {
          return;
        }

        const availableClusters = Array.isArray(response?.clusters)
          ? response.clusters
              .map((cluster: any) => ({
                name: typeof cluster?.name === 'string' ? cluster.name : '',
                server: typeof cluster?.server === 'string' ? cluster.server : '',
              }))
              .filter((cluster: FleetClusterInfo) => cluster.name.length > 0)
          : [];
        setClusters(availableClusters);
      })
      .catch((requestError: any) => {
        if (!mounted) {
          return;
        }

        setError(requestError?.message || 'Unable to load clusters.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { clusters, error };
}

function FleetConfiguration() {
  const { clusters, error } = useFleetClusters();
  const [selectedHubCluster, setSelectedHubCluster] = useState(getStoredHubCluster());
  const [savedHubCluster, setSavedHubCluster] = useState(getStoredHubCluster());
  const selectedHubClusterDetails = clusters.find(cluster => cluster.name === selectedHubCluster);
  const savedHubClusterDetails = clusters.find(cluster => cluster.name === savedHubCluster);

  useEffect(() => {
    if (clusters.length === 0) {
      return;
    }

    if (savedHubCluster && clusters.some(cluster => cluster.name === savedHubCluster)) {
      setSelectedHubCluster(savedHubCluster);
      return;
    }

    const firstCluster = clusters[0].name;
    setSelectedHubCluster(firstCluster);
    if (!savedHubCluster) {
      return;
    }

    persistHubCluster(firstCluster);
    setSavedHubCluster(firstCluster);
  }, [clusters, savedHubCluster]);

  const handleSave = () => {
    persistHubCluster(selectedHubCluster);
    setSavedHubCluster(selectedHubCluster);
  };

  return (
    <SectionBox title="KubeFleet Manager Configuration">
      <Box display="grid" gap={2} maxWidth="36rem">
        <Typography>
          Select which existing Kubernetes cluster should be used as the Fleet hub cluster.
        </Typography>
        {error && <Typography color="error">Unable to load clusters: {error}</Typography>}
        <FormControl fullWidth>
          <InputLabel id="fleet-hub-cluster-label">Hub Cluster</InputLabel>
          <Select
            labelId="fleet-hub-cluster-label"
            value={selectedHubCluster}
            label="Hub Cluster"
            onChange={event => setSelectedHubCluster(String(event.target.value || ''))}
          >
            {clusters.map(cluster => (
              <MenuItem key={cluster.name} value={cluster.name}>
                <Box display="grid">
                  <Typography>{cluster.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {cluster.server || 'Server URL unavailable'}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Selected cluster server URL: {selectedHubClusterDetails?.server || 'Unavailable'}
        </Typography>
        <Box display="flex" gap={1.5} alignItems="center">
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!selectedHubCluster || selectedHubCluster === savedHubCluster}
          >
            Save Hub Cluster
          </Button>
          <Typography variant="body2" color="text.secondary">
            Active hub cluster: {savedHubCluster || 'Not configured'}
            {savedHubCluster
              ? ` (${savedHubClusterDetails?.server || 'Server URL unavailable'})`
              : ''}
          </Typography>
        </Box>
      </Box>
    </SectionBox>
  );
}

async function fetchResourceList(
  hubCluster: string,
  pluralName: 'clusterresourceoverrides' | 'resourceoverrides'
): Promise<any[]> {
  const versions = ['v1', 'v1beta1', 'v1alpha1'];

  for (const version of versions) {
    try {
      const response = await ApiProxy.request(
        `/clusters/${encodeURIComponent(
          hubCluster
        )}/apis/placement.kubernetes-fleet.io/${version}/${pluralName}`,
        {},
        false,
        false
      );

      return Array.isArray(response?.items) ? response.items : [];
    } catch (requestError: any) {
      const status = requestError?.status || requestError?.response?.status;
      if (status === 404 || status === 403) {
        continue;
      }

      throw requestError;
    }
  }

  return [];
}

function ResourceOverrides() {
  const selectedHubCluster = getStoredHubCluster();
  const [overrides, setOverrides] = useState<any[] | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    if (!selectedHubCluster) {
      setOverrides([]);
      return () => {
        mounted = false;
      };
    }

    Promise.all([
      fetchResourceList(selectedHubCluster, 'clusterresourceoverrides'),
      fetchResourceList(selectedHubCluster, 'resourceoverrides'),
    ])
      .then(([clusterResourceOverrides, resourceOverrides]) => {
        if (!mounted) {
          return;
        }

        const mergedOverrides = [
          ...clusterResourceOverrides.map((item: any) => ({ ...item, __scope: 'Cluster' })),
          ...resourceOverrides.map((item: any) => ({ ...item, __scope: 'Namespace' })),
        ];

        setOverrides(mergedOverrides);
      })
      .catch((requestError: any) => {
        if (!mounted) {
          return;
        }

        setError(requestError?.message || 'Unable to load resource overrides.');
        setOverrides([]);
      });

    return () => {
      mounted = false;
    };
  }, [selectedHubCluster]);

  if (!selectedHubCluster) {
    return (
      <SectionBox title="Resource Overrides">
        <Typography>
          Configure a hub cluster in KubeFleet Configuration before viewing Resource Overrides.
        </Typography>
      </SectionBox>
    );
  }

  return (
    <>
      {error && (
        <SectionBox title="Resource Overrides">
          <Typography color="error">Unable to load overrides: {error}</Typography>
        </SectionBox>
      )}
      <ResourceListView
        title={`Resource Overrides (Hub: ${selectedHubCluster})`}
        data={overrides}
        columns={[
          {
            label: 'Name',
            getValue: (item: any) => item?.metadata?.name || '-',
          },
          {
            label: 'Type',
            getValue: (item: any) => item?.kind || '-',
          },
          {
            label: 'Scope',
            getValue: (item: any) => item?.__scope || '-',
          },
          {
            label: 'Namespace',
            getValue: (item: any) => item?.metadata?.namespace || '-',
          },
          {
            label: 'Created',
            getValue: (item: any) => item?.metadata?.creationTimestamp || '-',
          },
        ]}
      />
    </>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

function MemberClusters() {
  const formatMetadataMap = (metadataMap: Record<string, string> | undefined) => {
    if (!metadataMap || Object.keys(metadataMap).length === 0) {
      return '-';
    }

    return Object.entries(metadataMap)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  };

  return (
    <ResourceListView
      title="Member Clusters"
      resourceClass={MemberCluster}
      columns={[
        {
          label: 'Member Name',
          gridTemplate: 'min-content',
          getValue: (item: any) => item.getName(),
          render: (item: any) => {
            const clusterName = item.getName();
            return (
              <Link routeName="cluster" params={{ cluster: clusterName }}>
                {clusterName}
              </Link>
            );
          },
        },
        {
          label: 'Joined',
          gridTemplate: 'min-content',
          getValue: (item: any) =>
            item.jsonData?.status?.conditions?.find((c: any) => c.type === 'Joined')?.status ?? '-',
        },
        {
          label: 'Kubernetes',
          gridTemplate: 'min-content',
          getValue: (item: any) => {
            const versionProperty = item.jsonData?.status?.properties?.['k8s.io/k8s-version'];

            if (typeof versionProperty === 'string') {
              return versionProperty;
            }

            if (typeof versionProperty?.value === 'string') {
              return versionProperty.value;
            }

            return '-';
          },
        },
        {
          label: 'Labels',
          getValue: (item: any) => formatMetadataMap(item.jsonData?.metadata?.labels),
        },
        {
          label: 'Annotations',
          getValue: (item: any) => formatMetadataMap(item.jsonData?.metadata?.annotations),
        },
      ]}
    />
  );
}

function StagedResources() {
  const [namespaces] = K8s.ResourceClasses.Namespace.useList();

  const filteredNamespaces =
    namespaces?.filter(namespace => {
      const name = namespace.getName();
      return (
        name !== 'default' &&
        name !== 'fleet-system' &&
        !name.startsWith('kube-') &&
        !name.startsWith('fleet-member-')
      );
    }) ?? null;

  return (
    <ResourceListView
      title="Staged Resources"
      data={filteredNamespaces}
      columns={[
        'name',
        {
          label: 'Status',
          getValue: (item: any) => item.jsonData?.status?.phase ?? '-',
        },
        'age',
      ]}
    />
  );
}

function PlacementPolicies() {
  const [clusterPlacements] = ClusterResourcePlacement.useList();
  const [resourcePlacements] = ResourcePlacement.useList();

  const mergedPlacements =
    clusterPlacements && resourcePlacements ? [...clusterPlacements, ...resourcePlacements] : null;

  return (
    <ResourceListView
      title="Placement Policies"
      data={mergedPlacements}
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
              <Link routeName="namespace" params={{ name: namespace }} activeCluster={item.cluster}>
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
          label: 'Rollout Strategy',
          getValue: (item: any) => getPlacementStrategyType(item),
        },
      ]}
    />
  );
}

function getPlacementScope(item: any): 'Cluster' | 'Namespace' {
  return item.getNamespace?.() ? 'Namespace' : 'Cluster';
}

function getPlacementPolicyType(item: any): string {
  const policy = item?.jsonData?.spec?.policy;
  const placementType = policy?.placementType;

  if (typeof placementType === 'string' && placementType.length > 0) {
    return placementType;
  }

  if (policy?.pickAll) {
    return 'PickAll';
  }

  if (policy?.pickN) {
    return 'PickN';
  }

  if (policy?.pickFixed) {
    return 'PickFixed';
  }

  return '-';
}

function getPlacementStrategyType(item: any): 'RollingUpdate' | 'External' {
  const strategy = item?.jsonData?.spec?.strategy;

  if (!strategy) {
    return 'RollingUpdate';
  }

  const strategyType = String(strategy?.type || '').toLowerCase();

  if (strategyType.includes('external') || strategy?.external) {
    return 'External';
  }

  if (strategyType.includes('rolling') || strategy?.rollingUpdate) {
    return 'RollingUpdate';
  }

  return 'RollingUpdate';
}

function formatObjectSummary(data: Record<string, any> | undefined): string {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return '-';
  }

  return Object.entries(data)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

function getResourceSelectors(selectors: any[] | undefined): any[] {
  if (!Array.isArray(selectors)) {
    return [];
  }

  return selectors;
}

function formatPolicyDetails(item: any): string {
  const policy = item?.jsonData?.spec?.policy;
  if (!policy || typeof policy !== 'object') {
    return '-';
  }

  if (policy.pickN) {
    const numberOfClusters = policy.pickN?.numberOfClusters;
    return numberOfClusters !== undefined && numberOfClusters !== null
      ? `numberOfClusters=${numberOfClusters}`
      : 'PickN';
  }

  if (policy.pickFixed) {
    const clusterNames = policy.pickFixed?.clusterNames;
    return Array.isArray(clusterNames) && clusterNames.length > 0
      ? `clusterNames=${clusterNames.join(', ')}`
      : 'PickFixed';
  }

  if (policy.pickAll) {
    return 'All clusters matching selector';
  }

  return '-';
}

function formatConditions(conditions: any[] | undefined): string {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return '-';
  }

  return conditions
    .map(condition => `${condition?.type ?? 'Unknown'}=${condition?.status ?? '-'}`)
    .join(', ');
}

function ResourcePlacementDetails() {
  const {
    scope = '',
    placementName = '',
    namespace = '',
  } = useParams<{
    scope: string;
    placementName: string;
    namespace?: string;
  }>();
  const isNamespaceScope = scope === 'namespace';
  const resourceType = isNamespaceScope ? ResourcePlacement : ClusterResourcePlacement;
  const detailsNamespace = isNamespaceScope ? namespace || undefined : undefined;

  return (
    <DetailsGrid
      resourceType={resourceType}
      name={placementName}
      namespace={detailsNamespace}
      withEvents
      extraInfo={(item: any) =>
        item && [
          {
            name: 'Scope',
            value: item.getNamespace?.() || 'Cluster',
          },
          {
            name: 'Policy',
            value: getPlacementPolicyType(item),
          },
          {
            name: 'Policy Details',
            value: formatPolicyDetails(item),
          },
          {
            name: 'Cluster Names',
            value:
              Array.isArray(item.jsonData?.status?.targetClusters) &&
              item.jsonData.status.targetClusters.length > 0
                ? item.jsonData.status.targetClusters.join(', ')
                : '-',
          },
          {
            name: 'Conditions',
            value: formatConditions(item.jsonData?.status?.conditions),
          },
          {
            name: 'Labels',
            value: formatObjectSummary(item.jsonData?.metadata?.labels),
          },
          {
            name: 'Annotations',
            value: formatObjectSummary(item.jsonData?.metadata?.annotations),
          },
        ]
      }
      extraSections={(item: any) => [
        {
          id: 'fleet.resource-placement-selected-resources',
          section: (
            <SectionBox title="Selected Resources">
              <SimpleTable
                data={getResourceSelectors(item?.jsonData?.spec?.resourceSelectors)}
                columns={[
                  {
                    label: 'name',
                    getter: (selector: any) => selector?.name ?? '-',
                  },
                  {
                    label: 'kind',
                    getter: (selector: any) => selector?.kind ?? '-',
                  },
                  {
                    label: 'version',
                    getter: (selector: any) => selector?.version ?? '-',
                  },
                  {
                    label: 'group',
                    getter: (selector: any) => selector?.group ?? '-',
                  },
                  {
                    label: 'selectionScope',
                    getter: (selector: any) => selector?.selectionScope ?? '-',
                  },
                ]}
                emptyMessage="No resource selectors defined."
              />
            </SectionBox>
          ),
        },
        {
          id: 'fleet.resource-placement-manifest',
          section: (
            <SectionBox title="Manifest">
              <pre
                style={{
                  marginTop: '0.4rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  maxHeight: '24rem',
                  overflow: 'auto',
                  background: 'rgba(127,127,127,0.08)',
                }}
              >
                {JSON.stringify(item?.jsonData, null, 2)}
              </pre>
            </SectionBox>
          ),
        },
      ]}
    />
  );
}

function RolloutStrategies() {
  return (
    <ResourceListView
      title="Rollout Strategies"
      resourceClass={ClusterStagedUpdateStrategy}
      columns={[
        {
          label: 'Name',
          getValue: (item: any) => item.getName(),
          render: (item: any) => {
            const strategyName = item.getName();

            return (
              <Link routeName="fleet-rollout-strategy-details" params={{ strategyName }}>
                {strategyName}
              </Link>
            );
          },
        },
        {
          label: 'Stage Count',
          getValue: (item: any) => item.jsonData?.spec?.stages?.length ?? 0,
        },
        {
          label: 'After Stage Wait',
          getValue: (item: any) =>
            item.jsonData?.spec?.afterStageWaitSeconds !== null &&
            item.jsonData?.spec?.afterStageWaitSeconds !== undefined
              ? `${item.jsonData.spec.afterStageWaitSeconds}s`
              : '-',
        },
        'age',
      ]}
    />
  );
}

function formatLabelSelector(stage: any): string {
  const matchLabels =
    stage?.labelSelector?.matchLabels ??
    stage?.clusterSelector?.matchLabels ??
    stage?.clusterSelector?.labelSelector?.matchLabels ??
    stage?.placement?.clusterSelector?.matchLabels ??
    stage?.placement?.clusterSelector?.labelSelector?.matchLabels;

  if (!matchLabels || typeof matchLabels !== 'object' || Object.keys(matchLabels).length === 0) {
    return '-';
  }

  return Object.entries(matchLabels)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

function getTaskType(task: any): string {
  if (typeof task?.type === 'string') {
    return task.type;
  }

  if (task?.approval || task?.Approval) {
    return 'Approval';
  }

  if (task?.timedWait || task?.TimedWait) {
    return 'TimedWait';
  }

  return 'Unknown';
}

function renderTask(task: any, index: number) {
  const taskType = getTaskType(task);
  const taskLabel = task?.name ? `${taskType} – ${task.name}` : taskType;

  if (taskType === 'TimedWait') {
    // Prefer the raw YAML string (e.g. "5m", "30s"); fall back to numeric seconds field.
    const waitTime = task?.timedWait?.waitTime ?? task?.TimedWait?.waitTime ?? task?.waitTime;
    const waitTimeFallback =
      task?.timedWait?.waitTimeSeconds ??
      task?.TimedWait?.waitTimeSeconds ??
      task?.waitTimeSeconds ??
      task?.waitSeconds ??
      task?.durationSeconds;
    const displayValue =
      waitTime !== undefined && waitTime !== null
        ? String(waitTime)
        : waitTimeFallback !== undefined && waitTimeFallback !== null
        ? String(waitTimeFallback)
        : null;

    return (
      <div key={index} style={{ marginLeft: '0.75rem' }}>
        <strong>{taskLabel}</strong>
        {displayValue !== null && (
          <div style={{ marginLeft: '0.75rem' }}>Wait Time: {displayValue}</div>
        )}
      </div>
    );
  }

  return (
    <div key={index} style={{ marginLeft: '0.75rem' }}>
      <strong>{taskLabel}</strong>
    </div>
  );
}

function renderTaskList(tasks: any[] | undefined) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return <span>None</span>;
  }

  return (
    <div style={{ display: 'grid', gap: '0.2rem', marginTop: '0.15rem' }}>
      {tasks.map((task, index) => renderTask(task, index))}
    </div>
  );
}

function formatMaxConcurrency(stage: any): string {
  const maxConcurrency = stage?.maxConcurrency;
  if (maxConcurrency === undefined || maxConcurrency === null) {
    return 'None';
  }

  return String(maxConcurrency);
}

function getRolloutRunStatusDisplay(item: any): {
  label: string;
  status: 'success' | 'warning' | 'error' | '';
  detailedStatus: string;
} {
  const rawStatus = String(item?.jsonData?.spec?.State ?? item?.jsonData?.spec?.state ?? '').trim();
  const normalizedStatus = rawStatus.toLowerCase();
  const conditions = item?.jsonData?.status?.conditions;
  const detailedStatus = Array.isArray(conditions)
    ? conditions
        .map((condition: any) => {
          const conditionType = condition?.type ?? 'Unknown';
          const conditionStatus = condition?.status ?? '-';
          const reason = condition?.reason ? ` (${condition.reason})` : '';
          const message = condition?.message ? `: ${condition.message}` : '';

          return `${conditionType}=${conditionStatus}${reason}${message}`;
        })
        .join('\n')
    : rawStatus || 'Unknown';

  if (normalizedStatus === 'initialized') {
    return { label: 'Created', status: 'success', detailedStatus };
  }

  if (normalizedStatus === 'run') {
    return { label: 'Running', status: 'success', detailedStatus };
  }

  if (normalizedStatus === 'stop') {
    return { label: 'Stopped', status: 'warning', detailedStatus };
  }

  return {
    label: rawStatus || '-',
    status: rawStatus ? 'error' : '',
    detailedStatus,
  };
}

function makeRolloutRunStatusLabel(item: any) {
  const statusDisplay = getRolloutRunStatusDisplay(item);

  if (statusDisplay.label === '-') {
    return '-';
  }

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <LightTooltip title={statusDisplay.detailedStatus} interactive>
        <Box display="inline">
          <StatusLabel status={statusDisplay.status}>
            {(statusDisplay.status === 'warning' || statusDisplay.status === 'error') && (
              <Icon aria-label="hidden" icon="mdi:alert-outline" width="1.2rem" height="1.2rem" />
            )}
            {statusDisplay.label}
          </StatusLabel>
        </Box>
      </LightTooltip>
    </Box>
  );
}

function getRolloutRunScope(item: any): 'Cluster' | 'Namespace' {
  return item.getNamespace?.() ? 'Namespace' : 'Cluster';
}

function RolloutRunDetails() {
  const {
    scope = '',
    runName = '',
    namespace = '',
  } = useParams<{
    scope: string;
    runName: string;
    namespace?: string;
  }>();
  const isNamespaceScope = scope === 'namespace';
  const resourceType = isNamespaceScope ? StagedUpdateRun : ClusterStagedUpdateRun;
  const detailsNamespace = isNamespaceScope ? namespace || undefined : undefined;

  return (
    <DetailsGrid
      resourceType={resourceType}
      name={runName}
      namespace={detailsNamespace}
      extraInfo={(item: any) =>
        item && [
          {
            name: 'Scope',
            value: getRolloutRunScope(item) === 'Namespace' ? item.getNamespace?.() : 'Cluster',
          },
          {
            name: 'Placement',
            value: item.jsonData?.spec?.placementName ?? '-',
          },
          {
            name: 'Strategy',
            value: item.jsonData?.spec?.stagedUpdateStrategySnapshot?.name ?? '-',
          },
          {
            name: 'Current Stage',
            value: item.jsonData?.status?.stageName ?? '-',
          },
          {
            name: 'Status',
            value: makeRolloutRunStatusLabel(item),
          },
          {
            name: 'Conditions',
            value: formatConditions(item.jsonData?.status?.conditions),
          },
          {
            name: 'Labels',
            value: formatObjectSummary(item.jsonData?.metadata?.labels),
          },
          {
            name: 'Annotations',
            value: formatObjectSummary(item.jsonData?.metadata?.annotations),
          },
        ]
      }
      extraSections={(item: any) => [
        {
          id: 'fleet.rollout-run-conditions',
          section: (
            <SectionBox title="Conditions">
              <SimpleTable
                data={item?.jsonData?.status?.conditions ?? []}
                columns={[
                  {
                    label: 'Type',
                    getter: (condition: any) => condition?.type ?? '-',
                  },
                  {
                    label: 'Status',
                    getter: (condition: any) => condition?.status ?? '-',
                  },
                  {
                    label: 'Reason',
                    getter: (condition: any) => condition?.reason ?? '-',
                  },
                  {
                    label: 'Message',
                    getter: (condition: any) => condition?.message ?? '-',
                  },
                  {
                    label: 'Last Transition Time',
                    getter: (condition: any) => condition?.lastTransitionTime ?? '-',
                  },
                ]}
                emptyMessage="No conditions found."
              />
            </SectionBox>
          ),
        },
      ]}
    />
  );
}

function RolloutStrategyDetails() {
  const { strategyName = '' } = useParams<{ strategyName: string }>();
  const [strategy, error] = ClusterStagedUpdateStrategy.useGet(strategyName);

  if (!strategy && !error) {
    return (
      <SectionBox title={`Rollout Strategy: ${strategyName}`}>
        <Loader title="Loading strategy details" />
      </SectionBox>
    );
  }

  if (error) {
    return (
      <SectionBox title={`Rollout Strategy: ${strategyName}`}>
        <div>Unable to load strategy details: {error.message}</div>
      </SectionBox>
    );
  }

  const strategyData = strategy?.jsonData;
  const stages: any[] = strategyData?.spec?.stages ?? [];

  return (
    <SectionBox title={`Rollout Strategy: ${strategyName}`}>
      <div style={{ marginBottom: '1rem', opacity: 0.85 }}>
        Visual sequence of rollout stages, including cluster selectors, stage tasks, and concurrency
        limits.
      </div>

      {stages.length === 0 ? (
        <div>No stages are defined for this strategy.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {stages.map((stage, index) => (
            <div
              key={stage?.name ?? `stage-${index}`}
              style={{
                border: '1px solid rgba(127,127,127,0.35)',
                borderRadius: '8px',
                padding: '0.9rem',
                background: 'rgba(127,127,127,0.06)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
                Stage {index + 1}: {stage?.name ?? 'Unnamed stage'}
              </div>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <div>
                  <strong>Cluster Selector Labels:</strong> {formatLabelSelector(stage)}
                </div>
                <div>
                  <strong>Sorting Label Key:</strong> {stage?.sortingLabelKey ?? 'none'}
                </div>
                <div>
                  <strong>Before Stage Tasks:</strong> {renderTaskList(stage?.beforeStageTasks)}
                </div>
                <div>
                  <strong>After Stage Tasks:</strong> {renderTaskList(stage?.afterStageTasks)}
                </div>
                <div>
                  <strong>Max Concurrency:</strong> {formatMaxConcurrency(stage)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionBox>
  );
}

function RolloutRuns() {
  const [clusterRolloutRuns] = ClusterStagedUpdateRun.useList();
  const [rolloutRuns] = StagedUpdateRun.useList();

  const mergedRolloutRuns =
    clusterRolloutRuns && rolloutRuns ? [...clusterRolloutRuns, ...rolloutRuns] : null;

  return (
    <ResourceListView
      title="Rollout Runs"
      data={mergedRolloutRuns}
      columns={[
        {
          label: 'Name',
          getValue: (item: any) => item.getName(),
          render: (item: any) => {
            const scope = getRolloutRunScope(item);
            const name = item.getName();
            const namespace = item.getNamespace?.();
            const params =
              scope === 'Namespace' && namespace
                ? { scope: 'namespace', namespace, runName: name }
                : { scope: 'cluster', runName: name };
            const routeName =
              scope === 'Namespace' && namespace
                ? 'fleet-rollout-run-details-namespace'
                : 'fleet-rollout-run-details-cluster';

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
              <Link routeName="namespace" params={{ name: namespace }} activeCluster={item.cluster}>
                {namespace}
              </Link>
            );
          },
        },
        {
          label: 'Placement',
          getValue: (item: any) => item.jsonData?.spec?.placementName ?? '-',
        },
        {
          label: 'Strategy',
          getValue: (item: any) => item.jsonData?.spec?.stagedUpdateStrategySnapshot?.name ?? '-',
        },
        {
          label: 'Current Stage',
          getValue: (item: any) => item.jsonData?.status?.stageName ?? '-',
        },
        {
          label: 'Status',
          getValue: (item: any) => getRolloutRunStatusDisplay(item).label,
          render: (item: any) => makeRolloutRunStatusLabel(item),
        },
        'age',
      ]}
    />
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

registerRoute({
  path: '/fleet/member-clusters',
  sidebar: 'fleet-member-clusters',
  name: 'fleet-member-clusters',
  exact: true,
  component: MemberClusters,
});

registerRoute({
  path: '/fleet/configuration',
  sidebar: 'fleet-configuration',
  name: 'fleet-configuration',
  exact: true,
  component: FleetConfiguration,
});

registerRoute({
  path: '/fleet/resource-overrides',
  sidebar: 'fleet-resource-overrides',
  name: 'fleet-resource-overrides',
  exact: true,
  component: ResourceOverrides,
});

registerRoute({
  path: '/fleet/staged-resources',
  sidebar: 'fleet-staged-resources',
  name: 'fleet-staged-resources',
  exact: true,
  component: StagedResources,
});

registerRoute({
  path: '/fleet/placement-policies',
  sidebar: 'fleet-placement-policies',
  name: 'fleet-placement-policies',
  exact: true,
  component: PlacementPolicies,
});

registerRoute({
  path: '/fleet/placement-policies/:scope/:placementName',
  sidebar: 'fleet-placement-policies',
  name: 'fleet-placement-policy-details-cluster',
  exact: true,
  component: ResourcePlacementDetails,
});

registerRoute({
  path: '/fleet/placement-policies/:scope/:namespace/:placementName',
  sidebar: 'fleet-placement-policies',
  name: 'fleet-placement-policy-details-namespace',
  exact: true,
  component: ResourcePlacementDetails,
});

registerRoute({
  path: '/fleet/rollout-strategies',
  sidebar: 'fleet-rollout-strategies',
  name: 'fleet-rollout-strategies',
  exact: true,
  component: RolloutStrategies,
});

registerRoute({
  path: '/fleet/rollout-strategies/:strategyName',
  sidebar: 'fleet-rollout-strategies',
  name: 'fleet-rollout-strategy-details',
  exact: true,
  component: RolloutStrategyDetails,
});

registerRoute({
  path: '/fleet/rollout-runs',
  sidebar: 'fleet-rollout-runs',
  name: 'fleet-rollout-runs',
  exact: true,
  component: RolloutRuns,
});

registerRoute({
  path: '/fleet/rollout-runs/:scope/:runName',
  sidebar: 'fleet-rollout-runs',
  name: 'fleet-rollout-run-details-cluster',
  exact: true,
  component: RolloutRunDetails,
});

registerRoute({
  path: '/fleet/rollout-runs/:scope/:namespace/:runName',
  sidebar: 'fleet-rollout-runs',
  name: 'fleet-rollout-run-details-namespace',
  exact: true,
  component: RolloutRunDetails,
});
