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

import { K8s, registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { ResourceListView } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';

// ─── Custom Resource Classes ──────────────────────────────────────────────────

/**
 * MemberCluster represents a cluster that has joined the fleet.
 * API: cluster.kubernetes-fleet.io/v1
 */
const MemberCluster = makeCustomResourceClass(
  [['cluster.kubernetes-fleet.io', 'v1', 'memberclusters']],
  false // cluster-scoped
);

/**
 * ClusterResourcePlacement defines policies for placing resources across member clusters.
 * API: placement.kubernetes-fleet.io/v1beta1
 */
const ClusterResourcePlacement = makeCustomResourceClass(
  [['placement.kubernetes-fleet.io', 'v1beta1', 'clusterresourceplacements']],
  false // cluster-scoped
);

/**
 * ClusterStagedUpdateStrategy defines a staged rollout strategy for fleet updates.
 * API: placement.kubernetes-fleet.io/v1alpha1
 */
const ClusterStagedUpdateStrategy = makeCustomResourceClass(
  [['placement.kubernetes-fleet.io', 'v1alpha1', 'clusterstagedupdatestrategies']],
  false // cluster-scoped
);

/**
 * ClusterStagedUpdateRun tracks a staged rollout execution across the fleet.
 * API: placement.kubernetes-fleet.io/v1alpha1
 */
const ClusterStagedUpdateRun = makeCustomResourceClass(
  [['placement.kubernetes-fleet.io', 'v1alpha1', 'clusterstagedupdateruns']],
  false // cluster-scoped
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────

registerSidebarEntry({
  parent: null,
  name: 'fleet',
  label: 'Fleet',
  url: '/fleet/member-clusters',
  icon: 'mdi:ship-wheel',
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
  name: 'fleet-rollout-strategies',
  label: 'Rollout Strategies',
  url: '/fleet/rollout-strategies',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-rollout-runs',
  label: 'Rollout Runs',
  url: '/fleet/rollout-runs',
});

// ─── Views ────────────────────────────────────────────────────────────────────

function MemberClusters() {
  return (
    <ResourceListView
      title="Member Clusters"
      resourceClass={MemberCluster}
      columns={[
        'name',
        {
          label: 'Joined',
          getValue: (item: any) =>
            item.jsonData?.status?.conditions?.find((c: any) => c.type === 'Joined')?.status ?? '-',
        },
        {
          label: 'Health State',
          getValue: (item: any) =>
            item.jsonData?.status?.conditions?.find((c: any) => c.type === 'ConditionTypeHealthy')
              ?.status ?? '-',
        },
        {
          label: 'Agent Status',
          getValue: (item: any) => {
            const agents: any[] = item.jsonData?.status?.agentStatus ?? [];
            return agents.map((a: any) => a.type).join(', ') || '-';
          },
        },
        'age',
      ]}
    />
  );
}

function StagedResources() {
  const [namespaces] = K8s.ResourceClasses.Namespace.useList();

  const filteredNamespaces =
    namespaces?.filter(namespace => {
      const name = namespace.getName();
      return name !== 'default' && name !== 'fleet-system' && !name.startsWith('kube-');
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
  return (
    <ResourceListView
      title="Placement Policies"
      resourceClass={ClusterResourcePlacement}
      columns={[
        'name',
        {
          label: 'Placement Type',
          getValue: (item: any) =>
            item.jsonData?.spec?.policy?.placementType ?? 'RoundRobin',
        },
        {
          label: 'Cluster Count',
          getValue: (item: any) =>
            item.jsonData?.spec?.policy?.numberOfClusters ?? '-',
        },
        {
          label: 'Scheduled',
          getValue: (item: any) =>
            item.jsonData?.status?.conditions?.find(
              (c: any) => c.type === 'ClusterResourcePlacementScheduled'
            )?.status ?? '-',
        },
        'age',
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
        'name',
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

function RolloutRuns() {
  return (
    <ResourceListView
      title="Rollout Runs"
      resourceClass={ClusterStagedUpdateRun}
      columns={[
        'name',
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
          label: 'Succeeded',
          getValue: (item: any) =>
            item.jsonData?.status?.conditions?.find((c: any) => c.type === 'Succeeded')?.status ??
            '-',
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
  path: '/fleet/rollout-strategies',
  sidebar: 'fleet-rollout-strategies',
  name: 'fleet-rollout-strategies',
  exact: true,
  component: RolloutStrategies,
});

registerRoute({
  path: '/fleet/rollout-runs',
  sidebar: 'fleet-rollout-runs',
  name: 'fleet-rollout-runs',
  exact: true,
  component: RolloutRuns,
});
