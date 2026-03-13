# Fleet Plugin

A Headlamp plugin for managing Kubernetes Fleet resources, providing visibility into multi-cluster fleet operations.

## Sub-sections

| Section | CRD | Description |
|---|---|---|
| **Member Clusters** | `cluster.kubernetes-fleet.io/v1 MemberCluster` | Clusters that have joined the fleet |
| **Staged Resources** | `placement.kubernetes-fleet.io/v1beta1 ClusterResourceSnapshot` | Snapshots of resources staged for placement |
| **Placement Policies** | `placement.kubernetes-fleet.io/v1beta1 ClusterResourcePlacement` | Policies for distributing resources across member clusters |
| **Rollout Strategies** | `placement.kubernetes-fleet.io/v1alpha1 ClusterStagedUpdateStrategy` | Staged rollout strategy definitions |
| **Rollout Runs** | `placement.kubernetes-fleet.io/v1alpha1 ClusterStagedUpdateRun` | Execution history and status of staged rollouts |

## Prerequisites

The target cluster must have the [Kubernetes Fleet](https://github.com/Azure/fleet) CRDs installed.

## Development

```bash
npm install
npm start   # watch mode
npm run build
npm run tsc
npm run lint
```
