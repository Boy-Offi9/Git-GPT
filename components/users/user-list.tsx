"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RelatedUser } from "@/types/github";
import { UserRow } from "@/components/users/user-row";

type UserListProps = {
  users: RelatedUser[];
  selected?: Set<string>;
  onToggle?: (login: string, selected: boolean) => void;
  onUnfollow?: (login: string) => void;
  onFollow?: (user: RelatedUser) => void;
  onExplore?: (login: string) => void;
  pendingUsername?: string | null;
  selectable?: boolean;
  showFollowAction?: boolean;
  showExploreAction?: boolean;
};

export function UserList({
  users,
  selected,
  onToggle,
  onUnfollow,
  onFollow,
  onExplore,
  pendingUsername,
  selectable = false,
  showFollowAction = false,
  showExploreAction = false,
}: UserListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer is required for large GitHub graphs
  const virtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 16,
    getItemKey: (index) => users[index]?.id ?? index,
  });

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <ul
        className="relative w-full"
        style={{
          height: `${Math.max(virtualizer.getTotalSize(), 1)}px`,
          paddingBottom: selected && selected.size > 0 ? 96 : 8,
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const user = users[item.index];
          return (
            <li
              key={item.key}
              className="absolute top-0 right-0 left-0"
              style={{
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <UserRow
                user={user}
                selectable={selectable}
                showFollowAction={showFollowAction}
                showExploreAction={showExploreAction}
                selected={selected?.has(user.login)}
                onSelectedChange={(value) => onToggle?.(user.login, value)}
                onUnfollow={() => onUnfollow?.(user.login)}
                onFollow={() => onFollow?.(user)}
                onExplore={() => onExplore?.(user.login)}
                pending={pendingUsername === user.login}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
