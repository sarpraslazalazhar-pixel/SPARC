<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();
        $accounts = [
            [
                'email' => 'test@example.com',
                'name' => 'Test User',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'primary_role' => 'admin',
            ],
            [
                'email' => 'admin@sparc.go.id',
                'name' => 'Aldwin NV',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'primary_role' => 'admin',
            ],
            [
                'email' => 'aldwin@humas.instansi.go.id',
                'name' => 'Aldwin NV (Admin)',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'primary_role' => 'admin',
            ],
            [
                'email' => 'rina.kabag@humas.instansi.go.id',
                'name' => 'Rina Kartika',
                'password' => bcrypt('password'),
                'role' => 'manager',
                'primary_role' => 'manager',
            ],
            [
                'email' => 'nadia.planner@humas.instansi.go.id',
                'name' => 'Nadia Putri',
                'password' => bcrypt('password'),
                'role' => 'planner',
                'primary_role' => 'planner',
            ],
            [
                'email' => 'dimas.creative@humas.instansi.go.id',
                'name' => 'Dimas Pratama',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'fajar.social@humas.instansi.go.id',
                'name' => 'Fajar Nugroho',
                'password' => bcrypt('password'),
                'role' => 'publisher',
                'primary_role' => 'publisher',
            ],
            [
                'email' => 'budi.viewer@humas.instansi.go.id',
                'name' => 'Dr. Budi Santoso',
                'password' => bcrypt('password'),
                'role' => 'viewer',
                'primary_role' => 'viewer',
            ],
        ];

        foreach ($accounts as $acc) {
            User::updateOrCreate(['email' => $acc['email']], $acc);
        }
    }
}
