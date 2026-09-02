import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LineupAlert } from "@/lib/home/types";

export type LineupAlertsProps = {
  alerts: LineupAlert[];
};

/** Um alerta por vaga que não deve jogar a próxima rodada. Nada quando os 5 jogam. */
export function LineupAlerts({ alerts }: LineupAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <li key={alert.position}>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        </li>
      ))}
    </ul>
  );
}
