import { useEffect, useState } from "react";
import { Dipendente, Turno } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { Activity, Clock, Moon, CalendarOff, Pill } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Dipendente[]>([]);
  const [turniOggi, setTurniOggi] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, turniRes] = await Promise.all([
          fetch("/flask-api/api/statistiche", { credentials: "include" }),
          fetch("/flask-api/api/turni", { credentials: "include" }) // Need today's shifts, but endpoint just gives all for now, we'll filter client side for demo
        ]);
        
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        if (turniRes.ok) {
          const turniData = await turniRes.json();
          // Filter today's shifts, or just show the latest 5 if no today
          const today = new Date().toISOString().split('T')[0];
          const todayShifts = turniData.filter((t: Turno) => t.data === today);
          setTurniOggi(todayShifts.length > 0 ? todayShifts : turniData.slice(0, 5));
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const myStats = stats.find(s => s.id === user?.id) || user;

  if (loading) {
    return <div className="p-8 flex justify-center"><Activity className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
      
      {/* Personal Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ore Totali</p>
              <h3 className="text-2xl font-bold">{myStats?.ore_totali || 0}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-800 rounded-lg">
              <Moon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Notti Fatte</p>
              <h3 className="text-2xl font-bold">{myStats?.notti_fatte || 0}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <CalendarOff className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ferie</p>
              <h3 className="text-2xl font-bold">{myStats?.ferie || 0}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-red-100 text-red-600 rounded-lg">
              <Pill className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Malattia</p>
              <h3 className="text-2xl font-bold">{myStats?.malattia || 0}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Today's Shifts */}
        <Card>
          <CardHeader>
            <CardTitle>Turni in Evidenza</CardTitle>
          </CardHeader>
          <CardContent>
            {turniOggi.length === 0 ? (
              <p className="text-gray-500 text-sm">Nessun turno da mostrare.</p>
            ) : (
              <div className="space-y-4">
                {turniOggi.map((turno) => (
                  <div key={turno.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="font-medium text-gray-900">{turno.nome}</p>
                      <p className="text-sm text-gray-500">{turno.data}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={turno.ruolo} />
                      <ShiftBadge type={turno.tipo} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Ranking */}
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="text-right">Ore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.slice().sort((a, b) => b.ore_totali - a.ore_totali).map((dip) => (
                  <TableRow key={dip.id}>
                    <TableCell className="font-medium">{dip.nome}</TableCell>
                    <TableCell><RoleBadge role={dip.ruolo} /></TableCell>
                    <TableCell className="text-right font-mono">{dip.ore_totali}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
