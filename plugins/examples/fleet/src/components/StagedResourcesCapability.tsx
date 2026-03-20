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
import { ApiProxy, K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  CreateResourceButton,
  EditorDialog,
  Link,
  SectionBox,
  StatusLabel,
  Table,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

export function StagedResourcesCapability() {
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
