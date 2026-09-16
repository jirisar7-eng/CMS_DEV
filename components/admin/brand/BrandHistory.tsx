'use client';

export function BrandHistory({ versions, onRollback }: { versions: any[], onRollback: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        <h2 className="text-xl font-bold">Version History</h2>
        
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono">v{v.version}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      v.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-600' :
                      v.status === 'DRAFT' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-slate-500/10 text-slate-600'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {v.status === 'PUBLISHED' && (
                      <button 
                        onClick={() => onRollback(v.id)}
                        className="text-primary font-medium hover:underline"
                      >
                        Rollback to this
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
