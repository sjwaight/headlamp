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
  CreateResourceButton,
  DetailsGrid,
  EditorDialog,
  LightTooltip,
  Link,
  Loader,
  ResourceListView,
  SectionBox,
  SimpleTable,
  StatusLabel,
  Table,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import * as yaml from 'js-yaml';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

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
 * API: placement.kubernetes-fleet.io/v1
 */
const ClusterStagedUpdateStrategy = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1' }],
    kind: 'ClusterStagedUpdateStrategy',
    pluralName: 'clusterstagedupdatestrategies',
    singularName: 'clusterstagedupdatestrategy',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * StagedUpdateStrategy defines a namespace-scoped staged rollout strategy.
 * API: placement.kubernetes-fleet.io/v1
 */
const StagedUpdateStrategy = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1' }],
    kind: 'StagedUpdateStrategy',
    pluralName: 'stagedupdatestrategies',
    singularName: 'stagedupdatestrategy',
    isNamespaced: true,
  } // namespace-scoped
);

/**
 * ClusterStagedUpdateRun tracks a staged rollout execution across the fleet.
 * API: placement.kubernetes-fleet.io/v1
 */
const ClusterStagedUpdateRun = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1' }],
    kind: 'ClusterStagedUpdateRun',
    pluralName: 'clusterstagedupdateruns',
    singularName: 'clusterstagedupdaterun',
    isNamespaced: false,
  } // cluster-scoped
);

/**
 * StagedUpdateRun tracks a staged rollout execution in a namespace.
 * API: placement.kubernetes-fleet.io/v1
 */
const StagedUpdateRun = makeCustomResourceClass(
  {
    apiInfo: [{ group: 'placement.kubernetes-fleet.io', version: 'v1' }],
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
  name: 'fleet-resource-overrides',
  label: 'Resource Overrides',
  url: '/fleet/resource-overrides',
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

async function fetchResourceOverride(
  hubCluster: string,
  scope: 'cluster' | 'namespace',
  name: string,
  namespace?: string
): Promise<any> {
  const pluralName = scope === 'namespace' ? 'resourceoverrides' : 'clusterresourceoverrides';
  const versions = ['v1', 'v1beta1', 'v1alpha1'];

  for (const version of versions) {
    try {
      const basePath = `/clusters/${encodeURIComponent(
        hubCluster
      )}/apis/placement.kubernetes-fleet.io/${version}`;
      const itemPath =
        scope === 'namespace' && namespace
          ? `${basePath}/namespaces/${encodeURIComponent(
              namespace
            )}/${pluralName}/${encodeURIComponent(name)}`
          : `${basePath}/${pluralName}/${encodeURIComponent(name)}`;
      return await ApiProxy.request(itemPath, {}, false, false);
    } catch (requestError: any) {
      const status = requestError?.status || requestError?.response?.status;
      if (status === 404 || status === 403) {
        continue;
      }
      throw requestError;
    }
  }

  return {};
}

function ResourceOverrideDetails() {
  const {
    scope = '',
    name = '',
    namespace = '',
  } = useParams<{ scope: string; name: string; namespace?: string }>();
  const selectedHubCluster = getStoredHubCluster();
  const [override, setOverride] = useState<any | null>(null);
  const [detailError, setDetailError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    if (!selectedHubCluster) {
      setOverride({});
      return () => {
        mounted = false;
      };
    }

    fetchResourceOverride(
      selectedHubCluster,
      scope === 'namespace' ? 'namespace' : 'cluster',
      name,
      namespace || undefined
    )
      .then(data => {
        if (mounted) {
          setOverride(data);
        }
      })
      .catch((fetchError: any) => {
        if (mounted) {
          setDetailError(fetchError?.message || 'Unable to load resource override.');
          setOverride({});
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedHubCluster, scope, name, namespace]);

  const title = `Resource Override: ${name}`;

  if (!selectedHubCluster) {
    return (
      <SectionBox title={title}>
        <Typography>
          Configure a hub cluster in KubeFleet Configuration before viewing resource override
          details.
        </Typography>
      </SectionBox>
    );
  }

  if (override === null) {
    return (
      <SectionBox title={title}>
        <Loader title="Loading resource override" />
      </SectionBox>
    );
  }

  if (detailError) {
    return (
      <SectionBox title={title}>
        <Typography color="error">{detailError}</Typography>
      </SectionBox>
    );
  }

  const conditions: any[] = override?.status?.conditions ?? [];
  const rules: any[] = override?.spec?.rules ?? override?.spec?.overrides ?? [];
  const labels = override?.metadata?.labels ?? {};
  const annotations = override?.metadata?.annotations ?? {};

  return (
    <>
      <SectionBox title={title}>
        <SimpleTable
          data={[
            { field: 'Name', value: override?.metadata?.name ?? name },
            { field: 'Kind', value: override?.kind ?? '-' },
            {
              field: 'Scope',
              value:
                scope === 'namespace'
                  ? `Namespace (${override?.metadata?.namespace ?? namespace})`
                  : 'Cluster',
            },
            { field: 'API Version', value: override?.apiVersion ?? '-' },
            { field: 'Created', value: override?.metadata?.creationTimestamp ?? '-' },
            { field: 'Labels', value: formatObjectSummary(labels) },
            { field: 'Annotations', value: formatObjectSummary(annotations) },
          ]}
          columns={[
            { label: 'Field', getter: (row: any) => row.field },
            { label: 'Value', getter: (row: any) => row.value },
          ]}
        />
      </SectionBox>
      <SectionBox title="Override Rules">
        <SimpleTable
          data={rules}
          columns={[
            {
              label: 'Spec',
              getter: (rule: any) => (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {yaml.dump(rule)}
                </pre>
              ),
            },
          ]}
          emptyMessage="No override rules defined."
        />
      </SectionBox>
      <SectionBox title="Conditions">
        <SimpleTable
          data={conditions}
          columns={[
            { label: 'Type', getter: (c: any) => c?.type ?? '-' },
            { label: 'Status', getter: (c: any) => c?.status ?? '-' },
            { label: 'Reason', getter: (c: any) => c?.reason ?? '-' },
            { label: 'Message', getter: (c: any) => c?.message ?? '-' },
            { label: 'Last Transition', getter: (c: any) => c?.lastTransitionTime ?? '-' },
          ]}
          emptyMessage="No conditions found."
        />
      </SectionBox>
    </>
  );
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
        title={`Resource Overrides`}
        data={overrides}
        columns={[
          {
            label: 'Name',
            getValue: (item: any) => item?.metadata?.name || '-',
            render: (item: any) => {
              const itemName = item?.metadata?.name;
              if (!itemName) {
                return '-';
              }
              const itemScope = item?.__scope === 'Namespace' ? 'namespace' : 'cluster';
              const itemNamespace = item?.metadata?.namespace;
              const routeName =
                itemScope === 'namespace'
                  ? 'fleet-resource-override-details-namespace'
                  : 'fleet-resource-override-details-cluster';
              const params =
                itemScope === 'namespace' && itemNamespace
                  ? { scope: itemScope, namespace: itemNamespace, name: itemName }
                  : { scope: itemScope, name: itemName };

              return (
                <Link routeName={routeName} params={params}>
                  {itemName}
                </Link>
              );
            },
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

function renderMetadataChips(metadataMap: Record<string, string> | undefined) {
  if (!metadataMap || Object.keys(metadataMap).length === 0) {
    return <>-</>;
  }

  return (
    <Box display="flex" flexWrap="wrap" gap={0.5} py={0.25}>
      {Object.entries(metadataMap).map(([key, value]) => (
        <Chip key={key} label={`${key}=${value}`} size="small" variant="outlined" />
      ))}
    </Box>
  );
}

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
      headerProps={{ titleSideActions: [] }}
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
          label: 'Status',
          gridTemplate: 'min-content',
          getValue: (item: any) => {
            const props = item.jsonData?.status?.properties ?? {};
            const nodeCount = Number(
              props['kubernetes-fleet.io/node-count']?.value ??
                props['kubernetes-fleet.io/node-count'] ??
                0
            );
            const usage = item.jsonData?.status?.resourceUsage ?? {};
            const allUsageZero =
              Object.keys(usage).length === 0 ||
              Object.values(usage).every(
                (v: any) =>
                  v === 0 || v === '0' || (typeof v === 'object' && Number(v?.value ?? 0) === 0)
              );
            return nodeCount === 0 && allUsageZero ? 'Unavailable' : 'Available';
          },
          render: (item: any) => {
            const props = item.jsonData?.status?.properties ?? {};
            const nodeCount = Number(
              props['kubernetes-fleet.io/node-count']?.value ??
                props['kubernetes-fleet.io/node-count'] ??
                0
            );
            const usage = item.jsonData?.status?.resourceUsage ?? {};
            const allUsageZero =
              Object.keys(usage).length === 0 ||
              Object.values(usage).every(
                (v: any) =>
                  v === 0 || v === '0' || (typeof v === 'object' && Number(v?.value ?? 0) === 0)
              );
            const unavailable = nodeCount === 0 && allUsageZero;
            return (
              <StatusLabel status={unavailable ? 'error' : 'success'}>
                {unavailable ? 'Unavailable' : 'Available'}
              </StatusLabel>
            );
          },
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
          render: (item: any) => renderMetadataChips(item.jsonData?.metadata?.labels),
        },
      ]}
    />
  );
}

function StagedResources() {
  const [namespaces] = K8s.ResourceClasses.Namespace.useList();
  const [rolloutEditorOpen, setRolloutEditorOpen] = useState(false);
  const [rolloutTemplate, setRolloutTemplate] = useState<any>({});

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

  const createClusterRolloutPlacement = (selectedNamespaces: string[]) => ({
    apiVersion: 'placement.kubernetes-fleet.io/v1beta1',
    kind: 'ClusterResourcePlacement',
    metadata: {
      name: `rollout-selected-namespaces-${Date.now()}`,
    },
    spec: {
      resourceSelectors: selectedNamespaces.map(namespace => ({
        group: '',
        version: 'v1',
        kind: 'Namespace',
        name: namespace,
        selectionScope: 'NamespaceWithResources',
      })),
      policy: {
        placementType: 'PickAll',
      },
    },
  });

  return (
    <>
      <SectionBox title="Staged Resources">
        <Box display="flex" justifyContent="flex-end" mb={1.5}>
          <CreateResourceButton resourceClass={K8s.ResourceClasses.Namespace} />
        </Box>
        <Table<any>
          loading={filteredNamespaces === null}
          data={filteredNamespaces ?? []}
          enableRowSelection
          enableRowActions
          columns={[
            {
              id: 'name',
              header: 'Name',
              accessorFn: item => item.getName(),
              Cell: ({ row }) => {
                const namespace = row.original.getName();

                return (
                  <Link routeName="fleet-staged-resource-details" params={{ namespace }}>
                    {namespace}
                  </Link>
                );
              },
            },
            {
              id: 'status',
              header: 'Status',
              accessorFn: item => item.jsonData?.status?.phase ?? '-',
              Cell: ({ row }) => {
                const status = row.original.jsonData?.status?.phase ?? '-';

                return (
                  <StatusLabel status={status === 'Active' ? 'success' : 'error'}>
                    {status}
                  </StatusLabel>
                );
              },
            },
            {
              id: 'age',
              header: 'Age',
              accessorFn: item => item.jsonData?.metadata?.creationTimestamp ?? '-',
            },
          ]}
          renderRowActionMenuItems={({ closeMenu, row }) => {
            const namespace = row.original.getName();
            const search = {
              selectedName: namespace,
              selectedKind: 'Namespace',
              selectedVersion: 'v1',
              selectedGroup: '',
              selectedNamespace: namespace,
            };

            return [
              <MenuItem
                key="view-matching-policies"
                component={Link as any}
                routeName="fleet-placement-policies"
                search={search}
                onClick={closeMenu}
              >
                <ListItemIcon>
                  <Icon icon="mdi:filter-variant" />
                </ListItemIcon>
                <ListItemText>View matching policies</ListItemText>
              </MenuItem>,
            ];
          }}
          getRowId={item => item?.metadata?.uid || item?.getName()}
          renderRowSelectionToolbar={({ table }) => {
            const selectedItems = table.getSelectedRowModel().rows.map(row => row.original as any);
            const selectedNamespaces = selectedItems
              .map(item => item.getName())
              .filter((namespaceName: string) => !!namespaceName);

            const deleteSelectedNamespaces = () => {
              if (selectedItems.length === 0) {
                return;
              }

              const isConfirmed = window.confirm(
                `Delete ${selectedItems.length} selected namespace(s)?`
              );
              if (!isConfirmed) {
                return;
              }

              Promise.allSettled(
                selectedItems.map(item =>
                  typeof item.delete === 'function'
                    ? item.delete()
                    : ApiProxy.request(`/api/v1/namespaces/${encodeURIComponent(item.getName())}`, {
                        method: 'DELETE',
                      })
                )
              ).finally(() => {
                table.resetRowSelection();
              });
            };

            const openRolloutEditor = () => {
              if (selectedNamespaces.length === 0) {
                return;
              }

              setRolloutTemplate(createClusterRolloutPlacement(selectedNamespaces));
              setRolloutEditorOpen(true);
            };

            return (
              <Box display="flex" gap={1}>
                <Button color="error" variant="contained" onClick={deleteSelectedNamespaces}>
                  Delete
                </Button>
                <Button variant="contained" onClick={openRolloutEditor}>
                  Rollout to members
                </Button>
              </Box>
            );
          }}
        />
      </SectionBox>
      <EditorDialog
        open={rolloutEditorOpen}
        title="Rollout to Members"
        item={rolloutTemplate}
        onSave="default"
        onClose={() => setRolloutEditorOpen(false)}
        saveLabel="Create Cluster Placement Policy"
      />
    </>
  );
}

type NamespaceResourceDefinition = {
  group: string;
  version: string;
  kind: string;
  pluralName: string;
  apiVersion: string;
};

type NamespaceResourceRow = {
  metadata: {
    uid: string;
    name: string;
    namespace: string;
    creationTimestamp?: string;
  };
  kind: string;
  apiVersion: string;
  group: string;
  version: string;
  pluralName: string;
};

function uniqueResourceKey(definition: NamespaceResourceDefinition): string {
  return `${definition.group}/${definition.version}/${definition.pluralName}`;
}

async function listNamespacedResourceDefinitions(): Promise<NamespaceResourceDefinition[]> {
  const definitionsMap = new Map<string, NamespaceResourceDefinition>();

  const addDefinitions = (resources: any[], group: string, version: string) => {
    resources
      .filter(
        resource =>
          resource?.namespaced === true &&
          Array.isArray(resource?.verbs) &&
          resource.verbs.includes('list') &&
          typeof resource?.name === 'string' &&
          !resource.name.includes('/')
      )
      .forEach(resource => {
        const definition: NamespaceResourceDefinition = {
          group,
          version,
          kind: String(resource?.kind || ''),
          pluralName: String(resource?.name || ''),
          apiVersion: group ? `${group}/${version}` : version,
        };

        if (!definition.kind || !definition.pluralName) {
          return;
        }

        definitionsMap.set(uniqueResourceKey(definition), definition);
      });
  };

  const coreResources = await ApiProxy.request('/api/v1');
  addDefinitions(coreResources?.resources ?? [], '', 'v1');

  const apiGroups = await ApiProxy.request('/apis');
  const groupVersions: string[] = Array.isArray(apiGroups?.groups)
    ? apiGroups.groups.flatMap((group: any) =>
        Array.isArray(group?.versions)
          ? group.versions.map((version: any) => version?.groupVersion)
          : []
      )
    : [];

  const discoveryResults = await Promise.allSettled(
    groupVersions
      .filter(groupVersion => typeof groupVersion === 'string' && groupVersion.length > 0)
      .map(groupVersion => ApiProxy.request(`/apis/${groupVersion}`))
  );

  discoveryResults.forEach((result: PromiseSettledResult<any>) => {
    if (result.status !== 'fulfilled') {
      return;
    }

    const groupVersion = String(result.value?.groupVersion || '');
    const slashIndex = groupVersion.indexOf('/');
    if (slashIndex < 1) {
      return;
    }

    const group = groupVersion.slice(0, slashIndex);
    const version = groupVersion.slice(slashIndex + 1);
    addDefinitions(result.value?.resources ?? [], group, version);
  });

  return Array.from(definitionsMap.values());
}

function makeNamespacedResourcePath(
  namespace: string,
  definition: Pick<NamespaceResourceDefinition, 'group' | 'version' | 'pluralName'>
): string {
  if (!definition.group) {
    return `/api/${definition.version}/namespaces/${namespace}/${definition.pluralName}`;
  }

  return `/apis/${definition.group}/${definition.version}/namespaces/${namespace}/${definition.pluralName}`;
}

function makeNamespacedResourceItemPath(namespace: string, item: NamespaceResourceRow): string {
  return `${makeNamespacedResourcePath(namespace, item)}/${encodeURIComponent(item.metadata.name)}`;
}

async function listAllNamespaceResources(namespace: string): Promise<NamespaceResourceRow[]> {
  const resourceDefinitions = await listNamespacedResourceDefinitions();
  const listResults = await Promise.allSettled(
    resourceDefinitions.map(definition =>
      ApiProxy.request(makeNamespacedResourcePath(namespace, definition)).then(response => ({
        definition,
        items: Array.isArray(response?.items) ? response.items : [],
      }))
    )
  );

  const rows: NamespaceResourceRow[] = [];

  listResults.forEach((result, definitionIndex) => {
    if (result.status !== 'fulfilled') {
      return;
    }

    const definition = resourceDefinitions[definitionIndex];
    result.value.items.forEach((item: any) => {
      const name = item?.metadata?.name;
      const itemNamespace = item?.metadata?.namespace || namespace;
      if (typeof name !== 'string' || !name) {
        return;
      }

      rows.push({
        metadata: {
          uid:
            item?.metadata?.uid ||
            `${definition.apiVersion}/${definition.kind}/${itemNamespace}/${name}`,
          name,
          namespace: itemNamespace,
          creationTimestamp: item?.metadata?.creationTimestamp,
        },
        kind: definition.kind,
        apiVersion: definition.apiVersion,
        group: definition.group,
        version: definition.version,
        pluralName: definition.pluralName,
      });
    });
  });

  return rows;
}

function createRolloutPlacement(namespace: string, selectedResources: NamespaceResourceRow[]) {
  const selectors = selectedResources.map(resource => ({
    group: resource.group,
    version: resource.version,
    kind: resource.kind,
    name: resource.metadata.name,
  }));

  return {
    apiVersion: 'placement.kubernetes-fleet.io/v1beta1',
    kind: 'ResourcePlacement',
    metadata: {
      name: `rollout-${namespace}-${Date.now()}`,
      namespace,
    },
    spec: {
      resourceSelectors: selectors,
      policy: {
        placementType: 'PickAll',
      },
    },
  };
}

function StagedResourceDetails() {
  const { namespace = '' } = useParams<{ namespace: string }>();
  const [resources, setResources] = useState<NamespaceResourceRow[] | null>(null);
  const [error, setError] = useState<string>('');
  const [reloadToken, setReloadToken] = useState(0);
  const [rolloutEditorOpen, setRolloutEditorOpen] = useState(false);
  const [rolloutTemplate, setRolloutTemplate] = useState<any>({});

  useEffect(() => {
    let mounted = true;

    setResources(null);
    setError('');

    listAllNamespaceResources(namespace)
      .then(items => {
        if (!mounted) {
          return;
        }

        setResources(items);
      })
      .catch(listError => {
        if (!mounted) {
          return;
        }

        setResources([]);
        setError(listError?.message || 'Unable to load namespace resources.');
      });

    return () => {
      mounted = false;
    };
  }, [namespace, reloadToken]);

  const refreshResources = () => {
    setReloadToken(token => token + 1);
  };

  return (
    <SectionBox title={`Staged Resource: ${namespace}`}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Select resources in this namespace and either delete them or generate a rollout placement
        policy for member clusters.
      </Typography>
      {error && (
        <Typography color="error" sx={{ mb: 1.5 }}>
          {error}
        </Typography>
      )}
      <Table<NamespaceResourceRow>
        loading={resources === null}
        data={resources ?? []}
        enableRowSelection
        columns={[
          {
            id: 'name',
            header: 'Name',
            accessorFn: item => item.metadata.name,
            Cell: ({ row }) => {
              const resource = row.original as NamespaceResourceRow;

              return (
                <Link
                  routeName="fleet-placement-policies"
                  search={{
                    selectedName: resource.metadata.name,
                    selectedKind: resource.kind,
                    selectedVersion: resource.version,
                    selectedGroup: resource.group || '',
                    selectedNamespace: resource.metadata.namespace || '',
                  }}
                >
                  {resource.metadata.name}
                </Link>
              );
            },
          },
          {
            id: 'kind',
            header: 'Kind',
            accessorFn: item => item.kind,
          },
          {
            id: 'apiVersion',
            header: 'GVK',
            accessorFn: item => `${item.apiVersion}/${item.kind}`,
          },
          {
            id: 'namespace',
            header: 'Namespace',
            accessorFn: item => item.metadata.namespace,
          },
          {
            id: 'age',
            header: 'Created',
            accessorFn: item => item.metadata.creationTimestamp || '-',
          },
          {
            id: 'placementPolicies',
            header: 'Placement Policies',
            accessorFn: () => 'View matching policies',
            Cell: ({ row }) => {
              const resource = row.original as NamespaceResourceRow;

              return (
                <Link
                  routeName="fleet-placement-policies"
                  underline="always"
                  search={{
                    selectedName: resource.metadata.name,
                    selectedKind: resource.kind,
                    selectedVersion: resource.version,
                    selectedGroup: resource.group || '',
                    selectedNamespace: resource.metadata.namespace || '',
                  }}
                >
                  View matching policies
                </Link>
              );
            },
          },
        ]}
        getRowId={item => item.metadata.uid}
        renderRowSelectionToolbar={({ table }) => {
          const selectedResources = table
            .getSelectedRowModel()
            .rows.map(row => row.original as NamespaceResourceRow);

          const deleteSelectedResources = () => {
            if (selectedResources.length === 0) {
              return;
            }

            const isConfirmed = window.confirm(
              `Delete ${selectedResources.length} selected resource(s) from namespace ${namespace}?`
            );
            if (!isConfirmed) {
              return;
            }

            Promise.allSettled(
              selectedResources.map(resource =>
                ApiProxy.request(makeNamespacedResourceItemPath(namespace, resource), {
                  method: 'DELETE',
                })
              )
            ).finally(() => {
              table.resetRowSelection();
              refreshResources();
            });
          };

          const openRolloutEditor = () => {
            if (selectedResources.length === 0) {
              return;
            }

            setRolloutTemplate(createRolloutPlacement(namespace, selectedResources));
            setRolloutEditorOpen(true);
          };

          return (
            <Box display="flex" gap={1}>
              <Button color="error" variant="contained" onClick={deleteSelectedResources}>
                Delete
              </Button>
              <Button variant="contained" onClick={openRolloutEditor}>
                Rollout to members
              </Button>
            </Box>
          );
        }}
      />
      <EditorDialog
        open={rolloutEditorOpen}
        title="Rollout to Members"
        item={rolloutTemplate}
        onSave="default"
        onClose={() => {
          setRolloutEditorOpen(false);
          refreshResources();
        }}
        saveLabel="Create Placement Policy"
      />
    </SectionBox>
  );
}

function PlacementPolicies() {
  const [clusterPlacements] = ClusterResourcePlacement.useList();
  const [resourcePlacements] = ResourcePlacement.useList();
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

function formatPolicyDetails(item: any) {
  const policy = item?.jsonData?.spec?.policy;
  if (!policy || typeof policy !== 'object') {
    return '-';
  }

  const placementType = getPlacementPolicyType(item);
  const isPickFixed = placementType === 'PickFixed';
  const isPickN = placementType === 'PickN';
  const isPickAll = placementType === 'PickAll';

  const renderYamlSnippet = (snippet: Record<string, any>) => {
    const yamlSnippet = yaml.dump(snippet, { lineWidth: -1, noRefs: true }).trim();

    return (
      <pre
        style={{
          margin: 0,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
        }}
      >
        {yamlSnippet}
      </pre>
    );
  };

  if (isPickFixed || policy.pickFixed) {
    const clusterNames = policy.pickFixed?.clusterNames ?? policy.clusterNames;
    if (Array.isArray(clusterNames) && clusterNames.length > 0) {
      return renderYamlSnippet({ clusterNames });
    }

    return '-';
  }

  if (isPickAll || isPickN || policy.pickAll || policy.pickN) {
    const affinity = policy.pickN?.affinity ?? policy.pickAll?.affinity ?? policy?.affinity;
    const yamlFields: Record<string, any> = {};

    if (affinity !== undefined && affinity !== null) {
      yamlFields.affinity = affinity;
    }

    if (isPickN || policy.pickN) {
      const numberOfClusters = policy.pickN?.numberOfClusters ?? policy.numberOfClusters;
      if (numberOfClusters !== undefined && numberOfClusters !== null) {
        yamlFields.numberOfClusters = numberOfClusters;
      }

      const topologySpreadConstraints =
        policy.pickN?.topologySpreadConstraints ?? policy.topologySpreadConstraints;
      if (Array.isArray(topologySpreadConstraints) && topologySpreadConstraints.length > 0) {
        yamlFields.topologySpreadConstraints = topologySpreadConstraints;
      }
    }

    if (Object.keys(yamlFields).length === 0) {
      return '-';
    }

    return renderYamlSnippet(yamlFields);
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

function getPrimaryCondition(entry: any): any {
  const conditions = Array.isArray(entry?.conditions) ? entry.conditions : [];
  if (conditions.length === 0) {
    return null;
  }

  return (
    conditions.find((condition: any) => String(condition?.status) === 'False') ||
    conditions.find((condition: any) => String(condition?.status) === 'Unknown') ||
    conditions[0]
  );
}

function getPlacementStatusDisplay(item: any): {
  label: string;
  status: 'success' | 'warning' | 'error' | '';
  detailedStatus: string;
} {
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
    : 'Unknown';

  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { label: '-', status: '', detailedStatus };
  }

  const hasFalse = conditions.some((condition: any) => String(condition?.status) === 'False');
  if (hasFalse) {
    return { label: 'Not Ready', status: 'error', detailedStatus };
  }

  const hasUnknown = conditions.some((condition: any) => String(condition?.status) === 'Unknown');
  if (hasUnknown) {
    return { label: 'Pending', status: 'warning', detailedStatus };
  }

  return { label: 'Ready', status: 'success', detailedStatus };
}

function makePlacementStatusLabel(item: any) {
  const statusDisplay = getPlacementStatusDisplay(item);

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
            name: 'Policy Criteria',
            value: formatPolicyDetails(item),
          },
          {
            name: 'Status',
            value: makePlacementStatusLabel(item),
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
          id: 'fleet.resource-placement-conditions',
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
        {
          id: 'fleet.resource-placement-placement-status',
          section: (
            <SectionBox title="Placement Status">
              <Table<any>
                data={(
                  item?.jsonData?.status?.placementstatuses ??
                  item?.jsonData?.status?.placementStatuses ??
                  []
                ).map((statusEntry: any, index: number) => ({
                  ...statusEntry,
                  __id:
                    statusEntry?.clusterName || statusEntry?.cluster || statusEntry?.name
                      ? `${
                          statusEntry?.clusterName || statusEntry?.cluster || statusEntry?.name
                        }-${index}`
                      : `placement-status-${index}`,
                }))}
                getRowId={statusEntry => statusEntry.__id}
                rowsPerPage={[10, 25, 50]}
                columns={[
                  {
                    id: 'cluster',
                    header: 'Picked Cluster',
                    accessorFn: statusEntry =>
                      statusEntry?.clusterName || statusEntry?.cluster || statusEntry?.name || '-',
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    accessorFn: statusEntry => {
                      const primaryCondition = getPrimaryCondition(statusEntry);
                      return primaryCondition?.status || '-';
                    },
                  },
                  {
                    id: 'conditions',
                    header: 'Conditions',
                    accessorFn: statusEntry => formatConditions(statusEntry?.conditions),
                  },
                  {
                    id: 'reason',
                    header: 'Reason',
                    accessorFn: statusEntry => getPrimaryCondition(statusEntry)?.reason || '-',
                  },
                  {
                    id: 'message',
                    header: 'Message',
                    accessorFn: statusEntry => getPrimaryCondition(statusEntry)?.message || '-',
                  },
                  {
                    id: 'lastTransitionTime',
                    header: 'Last Transition Time',
                    accessorFn: statusEntry =>
                      getPrimaryCondition(statusEntry)?.lastTransitionTime || '-',
                  },
                ]}
              />
            </SectionBox>
          ),
        },
      ]}
    />
  );
}

function RolloutStrategies() {
  const [clusterStrategies] = ClusterStagedUpdateStrategy.useList();
  const [namespacedStrategies] = StagedUpdateStrategy.useList();
  const mergedStrategies =
    clusterStrategies && namespacedStrategies
      ? [...clusterStrategies, ...namespacedStrategies]
      : null;

  return (
    <ResourceListView
      title="Rollout Strategies"
      data={mergedStrategies}
      columns={[
        {
          label: 'Name',
          getValue: (item: any) => item.getName(),
          render: (item: any) => {
            const strategyName = item.getName();
            const strategyNamespace = item.getNamespace?.();
            const routeName = strategyNamespace
              ? 'fleet-rollout-strategy-details-namespace'
              : 'fleet-rollout-strategy-details-cluster';
            const params = strategyNamespace
              ? { scope: 'namespace', namespace: strategyNamespace, strategyName }
              : { scope: 'cluster', strategyName };

            return (
              <Link routeName={routeName} params={params}>
                {strategyName}
              </Link>
            );
          },
        },
        {
          label: 'Scope',
          getValue: (item: any) => item.getNamespace?.() || 'Cluster',
          render: (item: any) => item.getNamespace?.() || 'Cluster',
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
      actions={[
        {
          id: 'view-rollout-runs',
          action: ({ item, closeMenu }: { item: any; closeMenu: () => void }) => {
            const strategyName = item.getName();

            return (
              <MenuItem
                key="view-rollout-runs"
                component={Link as any}
                routeName="fleet-rollout-runs"
                search={{ strategy: strategyName }}
                onClick={closeMenu}
              >
                <ListItemIcon>
                  <Icon icon="mdi:format-list-bulleted" />
                </ListItemIcon>
                <ListItemText>View rollout runs</ListItemText>
              </MenuItem>
            );
          },
        },
      ]}
    />
  );
}

function getLabelSelectorMap(stage: any): Record<string, string> | null {
  const matchLabels =
    stage?.labelSelector?.matchLabels ??
    stage?.clusterSelector?.matchLabels ??
    stage?.clusterSelector?.labelSelector?.matchLabels ??
    stage?.placement?.clusterSelector?.matchLabels ??
    stage?.placement?.clusterSelector?.labelSelector?.matchLabels;

  if (!matchLabels || typeof matchLabels !== 'object' || Object.keys(matchLabels).length === 0) {
    return null;
  }
  return matchLabels;
}

function renderLabelSelectorChips(stage: any) {
  const labels = getLabelSelectorMap(stage);
  if (!labels) return <>-</>;
  return (
    <Box display="inline-flex" flexWrap="wrap" gap={0.5} ml={0.5}>
      {Object.entries(labels).map(([key, value]) => (
        <Chip key={key} label={`${key}=${String(value)}`} size="small" variant="outlined" />
      ))}
    </Box>
  );
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

function getStageTasks(stage: any, when: 'before' | 'after'): any[] {
  const candidates =
    when === 'before'
      ? [
          stage?.beforeStageTasks,
          stage?.beforeStageTask,
          stage?.tasks?.beforeStageTasks,
          stage?.tasks?.beforeStageTask,
        ]
      : [
          stage?.afterStageTasks,
          stage?.afterStageTask,
          stage?.tasks?.afterStageTasks,
          stage?.tasks?.afterStageTask,
        ];

  const resolved = candidates.find(Array.isArray);
  return Array.isArray(resolved) ? resolved : [];
}

function normalizeStrategyStages(stages: any[] | undefined): any[] {
  if (!Array.isArray(stages)) {
    return [];
  }

  return stages.map(stage => ({
    ...stage,
    beforeStageTasks: getStageTasks(stage, 'before'),
    afterStageTasks: getStageTasks(stage, 'after'),
  }));
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
  const conditions = item?.jsonData?.status?.conditions;
  const lastCondition =
    Array.isArray(conditions) && conditions.length > 0 ? conditions.at(-1) : null;

  if (
    String(lastCondition?.reason ?? '') === 'UpdateRunSucceeded' &&
    String(lastCondition?.type ?? '') === 'Succeeded' &&
    String(lastCondition?.status ?? '') === 'True'
  ) {
    const message = lastCondition?.message ?? 'All stages are completed successfully';

    return {
      label: 'Completed',
      status: 'success',
      detailedStatus: message,
    };
  }

  if (
    String(lastCondition?.reason ?? '') === 'UpdateRunWaiting' &&
    String(lastCondition?.type ?? '') === 'Progressing' &&
    String(lastCondition?.status ?? '') === 'False'
  ) {
    const message = lastCondition?.message ?? 'Update run is waiting';

    return {
      label: 'Waiting',
      status: 'warning',
      detailedStatus: message,
    };
  }

  if (
    String(lastCondition?.reason ?? '') === 'UpdateRunStopped' &&
    String(lastCondition?.type ?? '') === 'Progressing' &&
    String(lastCondition?.status ?? '') === 'False'
  ) {
    const reason = lastCondition?.reason ? ` (${lastCondition.reason})` : '';
    const message = lastCondition?.message ? `: ${lastCondition.message}` : '';

    return {
      label: 'User stopped',
      status: 'warning',
      detailedStatus: `UpdateRunStopped=${lastCondition?.status ?? '-'}${reason}${message}`,
    };
  }

  const initializedCondition = Array.isArray(conditions)
    ? conditions.find((condition: any) => condition?.type === 'Initialized')
    : null;

  if (initializedCondition) {
    const initializedStatus = String(initializedCondition?.status ?? '').toLowerCase();
    const reason = initializedCondition?.reason ? ` (${initializedCondition.reason})` : '';
    const message = initializedCondition?.message ? `: ${initializedCondition.message}` : '';
    const detailedStatus = `Initialized=${initializedCondition?.status ?? '-'}${reason}${message}`;

    if (initializedStatus === 'true') {
      return {
        label: 'Intialized OK',
        status: 'success',
        detailedStatus,
      };
    }

    if (initializedStatus === 'false') {
      return {
        label: 'Not Initialized',
        status: 'error',
        detailedStatus,
      };
    }
  }

  const rawStatus = String(item?.jsonData?.spec?.State ?? item?.jsonData?.spec?.state ?? '').trim();
  const normalizedStatus = rawStatus.toLowerCase();
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

  const isWaiting = statusDisplay.label === 'Waiting';

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <LightTooltip title={statusDisplay.detailedStatus} interactive>
        <Box display="inline">
          {isWaiting ? (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                px: '8px',
                py: '4px',
                borderRadius: '4px',
                border: '1px solid transparent',
                backgroundColor: '#e65100',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              <Icon aria-label="hidden" icon="mdi:timer-sand" width="1.1rem" height="1.1rem" />
              Waiting
            </Box>
          ) : (
            <StatusLabel status={statusDisplay.status}>
              {(statusDisplay.status === 'warning' || statusDisplay.status === 'error') && (
                <Icon aria-label="hidden" icon="mdi:alert-outline" width="1.2rem" height="1.2rem" />
              )}
              {statusDisplay.label}
            </StatusLabel>
          )}
        </Box>
      </LightTooltip>
    </Box>
  );
}

function getRolloutRunScope(item: any): 'Cluster' | 'Namespace' {
  return item.getNamespace?.() ? 'Namespace' : 'Cluster';
}

function getRolloutRunApiPath(item: any): string {
  const apiVersion = String(item?.jsonData?.apiVersion ?? 'placement.kubernetes-fleet.io/v1');
  const [group, version] = apiVersion.includes('/')
    ? apiVersion.split('/', 2)
    : ['placement.kubernetes-fleet.io', apiVersion];
  const name = item?.getName?.();
  const namespace = item?.getNamespace?.();
  const pluralName = namespace ? 'stagedupdateruns' : 'clusterstagedupdateruns';
  const basePath = `/apis/${group}/${version}`;

  return namespace
    ? `${basePath}/namespaces/${encodeURIComponent(namespace)}/${pluralName}/${encodeURIComponent(
        name
      )}`
    : `${basePath}/${pluralName}/${encodeURIComponent(name)}`;
}

function getRolloutRunStatusApiPath(item: any): string {
  return `${getRolloutRunApiPath(item)}/status`;
}

/**
 * Returns the stage name and approval-request resource name when the run's
 * current stage is blocked waiting for an Approval task whose request has
 * been created (beforeStageTaskStatus condition type=ApprovalRequestCreated,
 * status='True').
 */
function getApprovalWaitingStage(
  item: any
): { stageName: string; approvalRequestName: string } | null {
  const parsed = parseStagesStatus(getStagesStatusArray(item));
  for (const stage of parsed) {
    if (stage.stageStatus === 'waiting' && stage.waitingFor === 'Approval') {
      if (stage.approvalRequestName) {
        return { stageName: stage.stageName, approvalRequestName: stage.approvalRequestName };
      }
      // Fallback naming convention: {runName}-{stageName}
      const runName: string = item?.getName?.() ?? '';
      const name = stage.stageName ? `${runName}-${stage.stageName}` : runName;
      return { stageName: stage.stageName, approvalRequestName: name };
    }
  }
  return null;
}

async function approveStageRun(item: any): Promise<void> {
  const approvalInfo = getApprovalWaitingStage(item);
  if (!approvalInfo) {
    throw new Error('No stage is currently waiting for approval.');
  }
  await approveStageByName(item, approvalInfo.stageName, approvalInfo.approvalRequestName);
}

async function approveStageByName(
  item: any,
  stageName: string,
  approvalRequestName: string
): Promise<void> {
  const namespace = item?.getNamespace?.();
  const cluster = item?.cluster ?? null;
  const plural = namespace ? 'approvalrequests' : 'clusterapprovalrequests';
  const basePath = `/apis/placement.kubernetes-fleet.io/v1`;
  const resourcePath = namespace
    ? `${basePath}/namespaces/${encodeURIComponent(namespace)}/${plural}/${encodeURIComponent(
        approvalRequestName
      )}`
    : `${basePath}/${plural}/${encodeURIComponent(approvalRequestName)}`;
  const statusPath = `${resourcePath}/status`;

  const lastTransitionTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const patchBody = {
    status: {
      conditions: [
        {
          lastTransitionTime,
          message: 'ApprovedByUser',
          observedGeneration: 1,
          reason: 'ApprovedByUser',
          status: 'True',
          type: 'Approved',
        },
      ],
    },
  };

  console.info('Fleet Stage Approve action patching approval request status', {
    stage: stageName,
    approvalRequest: approvalRequestName,
    cluster,
    path: statusPath,
    patchBody,
  });

  await ApiProxy.request(statusPath, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    cluster,
    body: JSON.stringify(patchBody),
  });

  console.info('Fleet Stage Approve action patch succeeded', {
    stage: stageName,
    approvalRequest: approvalRequestName,
    cluster,
    path: statusPath,
  });
}

async function updateStagedUpdateRunState(
  item: any,
  stageName: string,
  nextState: 'Run' | 'Stop'
): Promise<void> {
  const patchBody = {
    spec: {
      State: nextState,
      state: nextState,
      stageName,
    },
  };

  if (typeof item?.patch === 'function') {
    try {
      await item.patch(patchBody);
      return;
    } catch {
      // Fall through to explicit API call.
    }
  }

  await ApiProxy.request(getRolloutRunApiPath(item), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    cluster: item?.cluster ?? null,
    body: JSON.stringify(patchBody),
  });
}

async function updateRolloutRunState(item: any, nextState: 'Run' | 'Stop'): Promise<void> {
  const patchBody = {
    spec: {
      State: nextState,
      state: nextState,
    },
  };

  if (typeof item?.patch === 'function') {
    await item.patch(patchBody);
    return;
  }

  await ApiProxy.request(getRolloutRunApiPath(item), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/merge-patch+json',
    },
    body: JSON.stringify(patchBody),
  });
}

// ─── Stage Status Parsing Types ───────────────────────────────────────────────

/** Standard Kubernetes condition. */
interface KubeConditionEntry {
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
  observedGeneration?: number;
}

/** A task entry in beforeStageTaskStatus or afterStageTaskStatus. */
interface StageTaskStatus {
  type: 'Approval' | 'TimedWait';
  approvalRequestName?: string;
  conditions: KubeConditionEntry[];
}

/** A cluster entry inside a stage. */
interface StageClusterStatus {
  clusterName: string;
  conditions: KubeConditionEntry[];
  state: 'in-progress' | 'completed' | 'failed' | 'pending';
}

/** A fully parsed stage from status.stagesStatus. */
interface ParsedStageStatus {
  stageName: string;
  startTime: string;
  endTime: string;
  conditions: KubeConditionEntry[];
  clusters: StageClusterStatus[];
  beforeStageTaskStatus: StageTaskStatus[];
  afterStageTaskStatus: StageTaskStatus[];
  stageStatus: 'succeeded' | 'stopped' | 'waiting' | 'progressing' | 'pending';
  stageStatusMessage: string;
  waitingFor: 'Approval' | 'TimedWait' | '';
  approvalRequestName: string;
  isProgressing: boolean;
}

// ─── Condition Helpers ────────────────────────────────────────────────────────

function parseConditions(raw: any): KubeConditionEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c: any) => c && typeof c === 'object')
    .map((c: any) => ({
      type: String(c.type ?? ''),
      status: String(c.status ?? ''),
      reason: String(c.reason ?? ''),
      message: String(c.message ?? ''),
      lastTransitionTime: String(c.lastTransitionTime ?? ''),
      ...(c.observedGeneration !== undefined
        ? { observedGeneration: Number(c.observedGeneration) }
        : {}),
    }));
}

function findCondition(
  conditions: KubeConditionEntry[],
  type: string
): KubeConditionEntry | undefined {
  return conditions.find(c => c.type === type);
}

function lastCondition(conditions: KubeConditionEntry[]): KubeConditionEntry | undefined {
  return conditions.length > 0 ? conditions[conditions.length - 1] : undefined;
}

// ─── Task Parsing ─────────────────────────────────────────────────────────────

function parseTaskStatusArray(raw: any): StageTaskStatus[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) => t && typeof t === 'object')
    .map((t: any) => ({
      type: String(t.type ?? '') as StageTaskStatus['type'],
      ...(t.approvalRequestName ? { approvalRequestName: String(t.approvalRequestName) } : {}),
      conditions: parseConditions(t.conditions),
    }));
}

// ─── Cluster State ────────────────────────────────────────────────────────────

function deriveClusterState(
  conditions: KubeConditionEntry[]
): 'in-progress' | 'completed' | 'failed' | 'pending' {
  // Check explicit Succeeded condition first
  const succeeded = findCondition(conditions, 'Succeeded');
  if (succeeded && succeeded.status === 'True') return 'completed';

  // Fleet uses ClusterUpdatingCondition with reason to indicate state
  const updating = findCondition(conditions, 'ClusterUpdatingCondition');
  if (updating) {
    if (updating.status === 'True' && /succeeded/i.test(updating.reason)) return 'completed';
    if (/failed/i.test(updating.reason)) return 'failed';
    // status=True with a non-succeeded/non-failed reason means in-progress
    if (updating.status === 'True') return 'in-progress';
    // status=False typically means not yet started or waiting
    return 'in-progress';
  }

  const started = findCondition(conditions, 'Started');
  if (started && started.status === 'True') {
    const last = lastCondition(conditions);
    if (last && /failed/i.test(last.reason)) return 'failed';
    return 'in-progress';
  }

  // Fall back to last condition
  const last = lastCondition(conditions);
  if (last) {
    if (/succeeded/i.test(last.reason) && last.status === 'True') return 'completed';
    if (/failed/i.test(last.reason)) return 'failed';
    // Any condition present means the cluster has been touched
    return 'in-progress';
  }

  return 'pending';
}

// ─── Stage Status Derivation ──────────────────────────────────────────────────

function deriveStageStatus(
  conditions: KubeConditionEntry[],
  beforeTasks: StageTaskStatus[],
  afterTasks: StageTaskStatus[]
): {
  stageStatus: ParsedStageStatus['stageStatus'];
  stageStatusMessage: string;
  waitingFor: 'Approval' | 'TimedWait' | '';
  approvalRequestName: string;
  isProgressing: boolean;
} {
  const last = lastCondition(conditions);

  // Succeeded
  const succeeded = findCondition(conditions, 'Succeeded');
  if (succeeded && succeeded.status === 'True' && succeeded.reason === 'StageUpdatingSucceeded') {
    return {
      stageStatus: 'succeeded',
      stageStatusMessage: succeeded.message || 'Stage update completed successfully',
      waitingFor: '',
      approvalRequestName: '',
      isProgressing: false,
    };
  }

  // Stopped
  if (last && last.reason === 'StageUpdatingStopped') {
    return {
      stageStatus: 'stopped',
      stageStatusMessage: last.message || 'Stage update stopped',
      waitingFor: '',
      approvalRequestName: '',
      isProgressing: false,
    };
  }

  // Waiting
  if (last && last.reason === 'StageUpdatingWaiting' && last.status === 'False') {
    // Determine what we are waiting for by inspecting task status
    let waitingFor: 'Approval' | 'TimedWait' | '' = '';
    let approvalRequestName = '';

    // Check before-stage tasks first
    for (const task of beforeTasks) {
      if (task.type === 'Approval') {
        const created = findCondition(task.conditions, 'ApprovalRequestCreated');
        if (created && created.status === 'True') {
          waitingFor = 'Approval';
          approvalRequestName = task.approvalRequestName ?? '';
          break;
        }
      }
      if (task.type === 'TimedWait') {
        const elapsed = findCondition(task.conditions, 'WaitTimeElapsed');
        if (!elapsed || elapsed.status !== 'True') {
          waitingFor = 'TimedWait';
          break;
        }
      }
    }

    // Check after-stage tasks for approval or timed wait
    if (!waitingFor) {
      for (const task of afterTasks) {
        if (task.type === 'Approval') {
          const created = findCondition(task.conditions, 'ApprovalRequestCreated');
          if (created && created.status === 'True') {
            waitingFor = 'Approval';
            approvalRequestName = task.approvalRequestName ?? '';
            break;
          }
        }
        if (task.type === 'TimedWait') {
          const elapsed = findCondition(task.conditions, 'WaitTimeElapsed');
          if (!elapsed || elapsed.status !== 'True') {
            waitingFor = 'TimedWait';
            break;
          }
        }
      }
    }

    // Fall back to message text
    if (!waitingFor) {
      const lc = last.message.toLowerCase();
      if (lc.includes('approval')) waitingFor = 'Approval';
      else if (lc.includes('timed') || lc.includes('wait')) waitingFor = 'TimedWait';
    }

    return {
      stageStatus: 'waiting',
      stageStatusMessage: last.message || 'Stage is waiting',
      waitingFor,
      approvalRequestName,
      isProgressing: false,
    };
  }

  // Progressing (Progressing condition with status=True or status=False with non-waiting reason)
  const progressing = findCondition(conditions, 'Progressing');
  if (progressing) {
    return {
      stageStatus: 'progressing',
      stageStatusMessage: progressing.message || '',
      waitingFor: '',
      approvalRequestName: '',
      isProgressing: true,
    };
  }

  // No conditions at all — stage hasn't started yet
  return {
    stageStatus: 'pending',
    stageStatusMessage: '',
    waitingFor: '',
    approvalRequestName: '',
    isProgressing: false,
  };
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

function parseStagesStatus(rawStagesStatus: any): ParsedStageStatus[] {
  if (!Array.isArray(rawStagesStatus)) return [];

  return rawStagesStatus
    .filter((s: any) => s && typeof s === 'object')
    .map((stage: any, index: number) => {
      const stageName = String(stage.stageName ?? stage.name ?? `Stage ${index + 1}`);
      const conditions = parseConditions(stage.conditions);
      const beforeStageTaskStatus = parseTaskStatusArray(stage.beforeStageTaskStatus);
      const afterStageTaskStatus = parseTaskStatusArray(stage.afterStageTaskStatus);

      const rawClusters: any[] = Array.isArray(stage.clusters) ? stage.clusters : [];
      const clusters: StageClusterStatus[] = rawClusters
        .filter((c: any) => c && typeof c === 'object' && c.clusterName)
        .map((c: any) => {
          const clusterConditions = parseConditions(c.conditions);
          return {
            clusterName: String(c.clusterName),
            conditions: clusterConditions,
            state: deriveClusterState(clusterConditions),
          };
        });

      const derived = deriveStageStatus(conditions, beforeStageTaskStatus, afterStageTaskStatus);

      return {
        stageName,
        startTime: String(stage.startTime ?? ''),
        endTime: String(stage.endTime ?? ''),
        conditions,
        clusters,
        beforeStageTaskStatus,
        afterStageTaskStatus,
        ...derived,
      };
    });
}

// ─── Stage status rows for the details table ──────────────────────────────────

type StageStatusRow = {
  id: string;
  stageName: string;
  selectedClusters: string[];
  clusterStates: Record<string, 'in-progress' | 'completed' | 'failed' | 'unknown'>;
  isProgressing: boolean;
  stageStatus: 'stopped' | 'completed' | 'waiting' | '';
  stageStatusMessage: string;
  waitingFor: 'Approval' | 'TimedWait' | '';
  approvalRequestName: string;
  parsed: ParsedStageStatus;
};

function getStagesStatusArray(item: any): any[] {
  const status = item?.jsonData?.status ?? {};
  return (
    status?.stagesStatus ??
    status?.stageStatuses ??
    status?.stages ??
    status?.runStatus?.stagesStatus ??
    status?.runStatus?.stageStatuses ??
    []
  );
}

function getCurrentStageName(item: any): string {
  const status = item?.jsonData?.status ?? {};
  const parsed = parseStagesStatus(getStagesStatusArray(item));

  if (parsed.length === 0) return status?.stageName ?? '-';

  // Walk from the end; the highest-index stage with conditions is the current one.
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].conditions.length > 0) return parsed[i].stageName;
  }

  return status?.stageName ?? parsed[0]?.stageName ?? '-';
}

function getStageStatusRows(item: any): StageStatusRow[] {
  const parsed = parseStagesStatus(getStagesStatusArray(item));

  return parsed.map((stage, index) => {
    const clusterStates: Record<string, 'in-progress' | 'completed' | 'failed' | 'unknown'> = {};
    const clusterNames: string[] = [];

    stage.clusters.forEach(c => {
      clusterNames.push(c.clusterName);
      clusterStates[c.clusterName] =
        c.state === 'pending' ? 'unknown' : (c.state as 'in-progress' | 'completed' | 'failed');
    });

    // Map parsed stageStatus to the table row's status enum
    let stageStatus: StageStatusRow['stageStatus'] = '';
    if (stage.stageStatus === 'succeeded') stageStatus = 'completed';
    else if (stage.stageStatus === 'stopped') stageStatus = 'stopped';
    else if (stage.stageStatus === 'waiting') stageStatus = 'waiting';

    return {
      id: `${stage.stageName}-${index}`,
      stageName: stage.stageName,
      selectedClusters: clusterNames,
      clusterStates,
      isProgressing: stage.isProgressing,
      stageStatus,
      stageStatusMessage: stage.stageStatusMessage,
      waitingFor: stageStatus === 'waiting' ? stage.waitingFor : '',
      approvalRequestName: stage.approvalRequestName,
      parsed: stage,
    };
  });
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

  const getRolloutRunStrategyName = (item: any): string =>
    item?.jsonData?.spec?.stagedRolloutStrategyName ??
    item?.jsonData?.spec?.stagedUpdateStrategyName ??
    item?.jsonData?.spec?.stagedUpdateStrategySnapshot?.name ??
    '-';

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
            value: getRolloutRunStrategyName(item),
          },
          {
            name: 'Current Stage',
            value: getCurrentStageName(item),
          },
          {
            name: 'Status',
            value: makeRolloutRunStatusLabel(item),
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
        {
          id: 'fleet.rollout-run-stage-status',
          section: (
            <SectionBox title="Stage Status">
              <Table<StageStatusRow>
                data={getStageStatusRows(item)}
                getRowId={stage => stage.id}
                enableSorting={false}
                enableTopToolbar={false}
                enableBottomToolbar={false}
                columns={[
                  {
                    id: 'stageName',
                    header: 'Stage',
                    accessorFn: stage => stage.stageName,
                    muiTableBodyCellProps: ({ row }) => ({
                      sx: {
                        backgroundColor: row.original.isProgressing
                          ? 'rgba(13, 71, 161, 0.12)'
                          : undefined,
                        borderLeft: row.original.isProgressing ? `3px solid #0d47a1` : undefined,
                      },
                    }),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    accessorFn: stage => stage.stageStatus || '-',
                    Cell: ({ row }) => {
                      const stage = row.original;

                      if (stage.stageStatus === 'stopped') {
                        return (
                          <LightTooltip
                            title={stage.stageStatusMessage || 'Stage update stopped'}
                            interactive
                          >
                            <Box display="inline">
                              <StatusLabel status="warning">Stopped</StatusLabel>
                            </Box>
                          </LightTooltip>
                        );
                      }

                      if (stage.stageStatus === 'completed') {
                        return (
                          <LightTooltip
                            title={
                              stage.stageStatusMessage || 'Stage update completed successfully'
                            }
                            interactive
                          >
                            <Box display="inline">
                              <StatusLabel status="success">Completed</StatusLabel>
                            </Box>
                          </LightTooltip>
                        );
                      }

                      if (stage.stageStatus === 'waiting') {
                        return (
                          <LightTooltip
                            title={stage.stageStatusMessage || 'Stage is waiting'}
                            interactive
                          >
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                px: '8px',
                                py: '4px',
                                borderRadius: '4px',
                                border: '1px solid transparent',
                                backgroundColor: '#e65100',
                                color: '#fff',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                              }}
                            >
                              <Icon icon="mdi:timer-sand" width="1.1rem" height="1.1rem" />
                              Waiting
                            </Box>
                          </LightTooltip>
                        );
                      }

                      return '-';
                    },
                    muiTableBodyCellProps: ({ row }) => ({
                      sx: {
                        backgroundColor: row.original.isProgressing
                          ? 'rgba(13, 71, 161, 0.12)'
                          : undefined,
                      },
                    }),
                  },
                  {
                    id: 'waitingFor',
                    header: 'Waiting For',
                    accessorFn: stage => stage.waitingFor || '-',
                    Cell: ({ row }) => {
                      const { waitingFor } = row.original;
                      if (!waitingFor) {
                        return '-';
                      }
                      const icon =
                        waitingFor === 'Approval' ? 'mdi:account-check-outline' : 'mdi:timer-sand';
                      return (
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Icon icon={icon} width="1.1rem" height="1.1rem" />
                          {waitingFor}
                        </Box>
                      );
                    },
                    muiTableBodyCellProps: ({ row }) => ({
                      sx: {
                        backgroundColor: row.original.isProgressing
                          ? 'rgba(13, 71, 161, 0.12)'
                          : undefined,
                      },
                    }),
                  },
                  {
                    id: 'selectedClusters',
                    header: 'Selected Clusters',
                    accessorFn: stage => stage.selectedClusters.join(', '),
                    Cell: ({ row }) => {
                      const stage = row.original;

                      if (
                        !Array.isArray(stage.selectedClusters) ||
                        stage.selectedClusters.length === 0
                      ) {
                        return '-';
                      }

                      return (
                        <Box display="flex" flexWrap="wrap" gap={0.5} py={0.25}>
                          {stage.selectedClusters.map(clusterName =>
                            (() => {
                              const clusterState = stage.clusterStates[clusterName] ?? 'unknown';
                              const chipLabel =
                                clusterState === 'in-progress'
                                  ? `${clusterName} (In progress)`
                                  : clusterState === 'completed'
                                  ? `${clusterName} (Completed)`
                                  : clusterState === 'failed'
                                  ? `${clusterName} (Failed)`
                                  : clusterName;

                              return (
                                <Chip
                                  key={`${stage.stageName}-${clusterName}`}
                                  label={chipLabel}
                                  size="small"
                                  variant={clusterState === 'unknown' ? 'outlined' : 'filled'}
                                  sx={
                                    clusterState === 'in-progress'
                                      ? {
                                          backgroundColor: '#0d47a1',
                                          color: '#fff',
                                        }
                                      : clusterState === 'completed'
                                      ? {
                                          backgroundColor: '#2e7d32',
                                          color: '#fff',
                                        }
                                      : clusterState === 'failed'
                                      ? {
                                          backgroundColor: '#d32f2f',
                                          color: '#fff',
                                        }
                                      : undefined
                                  }
                                />
                              );
                            })()
                          )}
                        </Box>
                      );
                    },
                    muiTableBodyCellProps: ({ row }) => ({
                      sx: {
                        backgroundColor: row.original.isProgressing
                          ? 'rgba(13, 71, 161, 0.12)'
                          : undefined,
                        borderRight: row.original.isProgressing ? `1px solid #5e92f3` : undefined,
                      },
                    }),
                  },
                  {
                    id: 'actions',
                    header: 'Actions',
                    accessorFn: () => '',
                    Cell: ({ row }) => {
                      const stage = row.original;
                      const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

                      const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
                        setAnchorEl(event.currentTarget);
                      };

                      const handleMenuClose = () => {
                        setAnchorEl(null);
                      };

                      const handleStart = async () => {
                        handleMenuClose();
                        try {
                          await updateStagedUpdateRunState(item, stage.stageName, 'Run');
                          window.location.reload();
                        } catch (error: any) {
                          window.alert(
                            error?.message || `Unable to start stage ${stage.stageName}.`
                          );
                        }
                      };

                      const handleStop = async () => {
                        handleMenuClose();
                        try {
                          await updateStagedUpdateRunState(item, stage.stageName, 'Stop');
                          window.location.reload();
                        } catch (error: any) {
                          window.alert(
                            error?.message || `Unable to stop stage ${stage.stageName}.`
                          );
                        }
                      };

                      const approvalRequestName = stage.approvalRequestName || null;
                      const canApprove = !!approvalRequestName;

                      const handleApprove = async () => {
                        handleMenuClose();
                        try {
                          await approveStageByName(item, stage.stageName, approvalRequestName!);
                          window.location.reload();
                        } catch (error: any) {
                          window.alert(
                            error?.message || `Unable to approve stage ${stage.stageName}.`
                          );
                        }
                      };

                      return (
                        <>
                          <IconButton
                            size="small"
                            onClick={handleMenuOpen}
                            aria-label="stage actions"
                          >
                            <Icon icon="mdi:dots-vertical" />
                          </IconButton>
                          <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={handleMenuClose}
                          >
                            <MenuItem onClick={() => void handleStart()}>
                              <ListItemIcon>
                                <Icon icon="mdi:play" />
                              </ListItemIcon>
                              <ListItemText>Start</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={() => void handleStop()}>
                              <ListItemIcon>
                                <Icon icon="mdi:stop" />
                              </ListItemIcon>
                              <ListItemText>Stop</ListItemText>
                            </MenuItem>
                            <MenuItem disabled={!canApprove} onClick={() => void handleApprove()}>
                              <ListItemIcon>
                                <Icon icon="mdi:account-check-outline" />
                              </ListItemIcon>
                              <ListItemText>Approve</ListItemText>
                            </MenuItem>
                          </Menu>
                        </>
                      );
                    },
                  },
                ]}
                emptyMessage="No stage status found."
              />
            </SectionBox>
          ),
        },
      ]}
    />
  );
}

function RolloutStrategyDetails() {
  const {
    scope = 'cluster',
    strategyName = '',
    namespace = '',
  } = useParams<{ scope?: string; strategyName: string; namespace?: string }>();
  const [clusterStrategies] = ClusterStagedUpdateStrategy.useList();
  const [namespacedStrategies] = StagedUpdateStrategy.useList();
  const isNamespaceScope = scope === 'namespace';

  const strategy = isNamespaceScope
    ? namespacedStrategies?.find(
        item => item.getName?.() === strategyName && item.getNamespace?.() === namespace
      )
    : clusterStrategies?.find(item => item.getName?.() === strategyName);

  const isLoading = isNamespaceScope ? !namespacedStrategies : !clusterStrategies;
  if (isLoading) {
    return (
      <SectionBox title={`Rollout Strategy: ${strategyName}`}>
        <Loader title="Loading strategy details" />
      </SectionBox>
    );
  }

  if (!strategy) {
    return (
      <SectionBox title={`Rollout Strategy: ${strategyName}`}>
        <div>
          Unable to load strategy details for{' '}
          {isNamespaceScope ? `namespace ${namespace}` : 'cluster'}.
        </div>
      </SectionBox>
    );
  }

  const strategyData = strategy?.jsonData;
  const stages = normalizeStrategyStages(strategyData?.spec?.stages);

  return (
    <SectionBox title={`Rollout Strategy: ${strategyName}`}>
      <div style={{ marginBottom: '1rem', opacity: 0.85 }}>
        Visual sequence of rollout stages, including cluster selectors, stage tasks, and concurrency
        limits.
      </div>

      {stages.length === 0 ? (
        <div>No stages are defined for this strategy.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {stages.map((stage, index) => (
            <div key={stage?.name ?? `stage-${index}`}>
              {index > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '4px 0',
                  }}
                >
                  <Icon icon="mdi:arrow-down" width="1.5rem" height="1.5rem" color="#90a4ae" />
                </div>
              )}
              <div
                style={{
                  border: '1px solid rgba(127,127,127,0.35)',
                  borderRadius: '8px',
                  padding: '0.9rem',
                  background: 'rgba(127,127,127,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    marginBottom: '0.6rem',
                  }}
                >
                  <div
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '50%',
                      background: '#1976d2',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {stage?.name ?? 'Unnamed stage'}
                  </Typography>
                </div>
                <div style={{ display: 'grid', gap: '0.35rem', paddingLeft: '2.6rem' }}>
                  <div>
                    <strong>Cluster Selector Labels:</strong> {renderLabelSelectorChips(stage)}
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
  const location = useLocation();
  const strategyFilter = new URLSearchParams(location.search).get('strategy') || '';

  const allRuns =
    clusterRolloutRuns && rolloutRuns ? [...clusterRolloutRuns, ...rolloutRuns] : null;
  const mergedRolloutRuns =
    allRuns && strategyFilter
      ? allRuns.filter(
          (item: any) => (item.jsonData?.spec?.stagedRolloutStrategyName ?? '') === strategyFilter
        )
      : allRuns;

  return (
    <>
      {strategyFilter && (
        <SectionBox title="Active Filter">
          <Typography variant="body2">
            Showing only rollout runs using strategy <strong>{strategyFilter}</strong>.
          </Typography>
          <Box mt={1}>
            <Link routeName="fleet-rollout-runs">Clear filter</Link>
          </Box>
        </SectionBox>
      )}
      <ResourceListView
        title="Rollout Runs"
        data={mergedRolloutRuns}
        columns={[
          {
            label: 'Run Name',
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
            label: 'Placement',
            getValue: (item: any) => item.jsonData?.spec?.placementName ?? '-',
            render: (item: any) => {
              const placementName = item.jsonData?.spec?.placementName;
              if (!placementName) {
                return '-';
              }

              return (
                <Link
                  routeName="fleet-placement-policy-details-cluster"
                  params={{ scope: 'cluster', placementName }}
                >
                  {placementName}
                </Link>
              );
            },
          },
          {
            label: 'Strategy',
            getValue: (item: any) => item.jsonData?.spec?.stagedRolloutStrategyName ?? '-',
            render: (item: any) => {
              const strategyName = item.jsonData?.spec?.stagedRolloutStrategyName;

              if (!strategyName) {
                return '-';
              }

              return (
                <Link routeName="fleet-rollout-strategy-details" params={{ strategyName }}>
                  {strategyName}
                </Link>
              );
            },
          },
          {
            label: 'Current Stage',
            getValue: (item: any) => getCurrentStageName(item),
          },
          {
            label: 'Status',
            getValue: (item: any) => getRolloutRunStatusDisplay(item).label,
            render: (item: any) => makeRolloutRunStatusLabel(item),
          },
          {
            label: 'Waiting For',
            getValue: (item: any) => {
              const waitingRow = getStageStatusRows(item).find(r => r.stageStatus === 'waiting');
              return waitingRow?.waitingFor || '-';
            },
            render: (item: any) => {
              const waitingRow = getStageStatusRows(item).find(r => r.stageStatus === 'waiting');
              const taskType = waitingRow?.waitingFor;
              if (!taskType) {
                return '-';
              }
              const icon = taskType === 'Approval' ? 'mdi:account-check-outline' : 'mdi:timer-sand';
              return (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Icon icon={icon} width="1.1rem" height="1.1rem" />
                  {taskType}
                </Box>
              );
            },
          },
          'age',
        ]}
        actions={[
          {
            id: 'start',
            action: ({ item, closeMenu }: { item: any; closeMenu: () => void }) => {
              const runName = item.getName();
              const isCompleted = getRolloutRunStatusDisplay(item).label === 'Completed';

              const handleStateUpdate = async () => {
                closeMenu();

                try {
                  await updateRolloutRunState(item, 'Run');
                  window.location.reload();
                } catch (error: any) {
                  window.alert(error?.message || `Unable to set ${runName} to Run.`);
                }
              };

              return (
                <MenuItem
                  key="start"
                  disabled={isCompleted}
                  onClick={() => void handleStateUpdate()}
                >
                  <ListItemIcon>
                    <Icon icon="mdi:play" />
                  </ListItemIcon>
                  <ListItemText>Start</ListItemText>
                </MenuItem>
              );
            },
          },
          {
            id: 'stop',
            action: ({ item, closeMenu }: { item: any; closeMenu: () => void }) => {
              const runName = item.getName();
              const isCompleted = getRolloutRunStatusDisplay(item).label === 'Completed';

              const handleStateUpdate = async () => {
                closeMenu();

                try {
                  await updateRolloutRunState(item, 'Stop');
                  window.location.reload();
                } catch (error: any) {
                  window.alert(error?.message || `Unable to set ${runName} to Stop.`);
                }
              };

              return (
                <MenuItem
                  key="stop"
                  disabled={isCompleted}
                  onClick={() => void handleStateUpdate()}
                >
                  <ListItemIcon>
                    <Icon icon="mdi:stop" />
                  </ListItemIcon>
                  <ListItemText>Stop</ListItemText>
                </MenuItem>
              );
            },
          },
          {
            id: 'approve',
            action: ({ item, closeMenu }: { item: any; closeMenu: () => void }) => {
              const approvalInfo = getApprovalWaitingStage(item);
              const canApprove = approvalInfo !== null;

              const handleApprove = async () => {
                closeMenu();
                try {
                  await approveStageRun(item);
                  window.location.reload();
                } catch (error: any) {
                  const statusPath = getRolloutRunStatusApiPath(item);
                  const clusterName = item?.cluster ?? 'current';
                  const errorMessage = error?.message || 'Unable to approve stage.';
                  window.alert(
                    `${errorMessage}\nPath: ${statusPath}\nCluster: ${String(clusterName)}`
                  );
                }
              };

              return (
                <MenuItem key="approve" disabled={!canApprove} onClick={() => void handleApprove()}>
                  <ListItemIcon>
                    <Icon icon="mdi:account-check-outline" />
                  </ListItemIcon>
                  <ListItemText>Approve</ListItemText>
                </MenuItem>
              );
            },
          },
        ]}
      />
    </>
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
  path: '/fleet/resource-overrides/details/:scope/:name',
  sidebar: 'fleet-resource-overrides',
  name: 'fleet-resource-override-details-cluster',
  exact: true,
  component: ResourceOverrideDetails,
});

registerRoute({
  path: '/fleet/resource-overrides/details/:scope/:namespace/:name',
  sidebar: 'fleet-resource-overrides',
  name: 'fleet-resource-override-details-namespace',
  exact: true,
  component: ResourceOverrideDetails,
});

registerRoute({
  path: '/fleet/staged-resources',
  sidebar: 'fleet-staged-resources',
  name: 'fleet-staged-resources',
  exact: true,
  component: StagedResources,
});

registerRoute({
  path: '/fleet/staged-resources/:namespace',
  sidebar: 'fleet-staged-resources',
  name: 'fleet-staged-resource-details',
  exact: true,
  component: StagedResourceDetails,
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
  path: '/fleet/rollout-strategies/:scope/:strategyName',
  sidebar: 'fleet-rollout-strategies',
  name: 'fleet-rollout-strategy-details-cluster',
  exact: true,
  component: RolloutStrategyDetails,
});

registerRoute({
  path: '/fleet/rollout-strategies/:scope/:namespace/:strategyName',
  sidebar: 'fleet-rollout-strategies',
  name: 'fleet-rollout-strategy-details-namespace',
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
