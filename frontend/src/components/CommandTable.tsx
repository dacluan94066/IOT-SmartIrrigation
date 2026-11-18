import { Check, Clock3, Radio, ShieldX } from "lucide-react";
import type { Command } from "../types/api";
import { Badge, EmptyState } from "./ui";
import type { Tone } from "./ui";
import {
  commandLabel,
  dateTime,
  humanReason,
  statusLabel,
} from "../utils/format";
export const commandTone: Record<Command["status"], Tone> = {
  PENDING: "amber",
  DELIVERED: "blue",
  EXECUTED: "green",
  REJECTED: "red",
  EXPIRED: "gray",
  SUPERSEDED: "gray",
};
export function CommandStatus({ command }: { command: Command }) {
  const Icon =
    command.status === "EXECUTED"
      ? Check
      : command.status === "REJECTED"
        ? ShieldX
        : command.status === "DELIVERED"
          ? Radio
          : Clock3;
  return (
    <Badge tone={commandTone[command.status]}>
      <Icon size={13} />
      {statusLabel[command.status]}
    </Badge>
  );
}
export function CommandTable({ commands }: { commands: Command[] }) {
  return commands.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Lệnh</th>
            <th>Thời gian gửi</th>
            <th>Trạng thái / ACK</th>
            <th>Phản hồi từ ESP32</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{commandLabel[c.type]}</strong>
                <span className="table-sub">#{c.id}</span>
              </td>
              <td className="no-wrap">
                {dateTime(c.createdAt)}
                <span className="table-sub">
                  Hiệu lực đến {dateTime(c.expiresAt)}
                </span>
              </td>
              <td>
                <CommandStatus command={c} />
                {c.ackAt && (
                  <span className="table-sub">ACK {dateTime(c.ackAt)}</span>
                )}
              </td>
              <td className="reason-cell">{humanReason(c.ackReason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState
      title="Chưa có lệnh điều khiển"
      description="Các lệnh và phản hồi thực tế của ESP32 sẽ được ghi nhận tại đây."
    />
  );
}
