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
import {
  Link,
  Loader,
  ResourceListView,
  SectionBox,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';
import { useParams } from 'react-router-dom';

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
  label: 'Staged Rollout Strategies',
  url: '/fleet/rollout-strategies',
});

registerSidebarEntry({
  parent: 'fleet',
  name: 'fleet-rollout-runs',
  label: 'Staged Rollout Runs',
  url: '/fleet/rollout-runs',
});

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

function formatObjectSummary(data: Record<string, any> | undefined): string {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return '-';
  }

  return Object.entries(data)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

function formatResourceSelectors(selectors: any[] | undefined): string {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return '-';
  }

  return selectors
    .map(selector => {
      const group = selector?.group ?? 'core';
      const version = selector?.version ?? '-';
      const kind = selector?.kind ?? '-';
      const name = selector?.name ?? '*';
      const namespace = selector?.namespace;

      if (namespace) {
        return `${group}/${version} ${kind} ${namespace}/${name}`;
      }

      return `${group}/${version} ${kind} ${name}`;
    })
    .join(' | ');
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
  const [clusterPlacement, clusterPlacementError] = ClusterResourcePlacement.useGet(placementName);
  const [resourcePlacement, resourcePlacementError] = ResourcePlacement.useGet(
    placementName,
    namespace || undefined
  );

  const isNamespaceScope = scope === 'namespace';
  const placement = isNamespaceScope ? resourcePlacement : clusterPlacement;
  const placementError = isNamespaceScope ? resourcePlacementError : clusterPlacementError;

  if (!placement && !placementError) {
    return (
      <SectionBox title={`Resource Placement: ${placementName}`}>
        <Loader title="Loading placement details" />
      </SectionBox>
    );
  }

  if (placementError) {
    return (
      <SectionBox title={`Resource Placement: ${placementName}`}>
        <div>Unable to load placement details: {placementError.message}</div>
      </SectionBox>
    );
  }

  if (!placement) {
    const scopedName =
      isNamespaceScope && namespace ? `${namespace}/${placementName}` : placementName;
    return (
      <SectionBox title={`Resource Placement: ${scopedName}`}>
        <div>Placement not found.</div>
      </SectionBox>
    );
  }

  const placementScope = getPlacementScope(placement);
  const metadata = placement.jsonData?.metadata;
  const spec = placement.jsonData?.spec;
  const status = placement.jsonData?.status;

  return (
    <SectionBox title={`Resource Placement: ${placement.getName()}`}>
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <div>
          <strong>Name:</strong> {placement.getName()}
        </div>
        <div>
          <strong>Scope:</strong> {placementScope}
        </div>
        {placementScope === 'Namespace' && (
          <div>
            <strong>Namespace:</strong> {placement.getNamespace?.() ?? '-'}
          </div>
        )}
        <div>
          <strong>Policy:</strong> {getPlacementPolicyType(placement)}
        </div>
        <div>
          <strong>Policy Details:</strong> {formatPolicyDetails(placement)}
        </div>
        <div>
          <strong>Resource Selectors:</strong> {formatResourceSelectors(spec?.resourceSelectors)}
        </div>
        <div>
          <strong>Cluster Names:</strong>{' '}
          {Array.isArray(status?.targetClusters) && status.targetClusters.length > 0
            ? status.targetClusters.join(', ')
            : '-'}
        </div>
        <div>
          <strong>Conditions:</strong> {formatConditions(status?.conditions)}
        </div>
        <div>
          <strong>Labels:</strong> {formatObjectSummary(metadata?.labels)}
        </div>
        <div>
          <strong>Annotations:</strong> {formatObjectSummary(metadata?.annotations)}
        </div>
        <div>
          <strong>Manifest:</strong>
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
            {JSON.stringify(placement.jsonData, null, 2)}
          </pre>
        </div>
      </div>
    </SectionBox>
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
