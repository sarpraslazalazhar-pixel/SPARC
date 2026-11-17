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
        $accounts = [
            [
                'email' => 'test@example.com',
                'name' => 'Test User',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'primary_role' => 'admin',
            ],
            [
                'email' => 'bayu@alazharpeduli.or.id',
                'name' => 'Bayu Juni Setiawan',
                'password' => bcrypt('password'),
                'role' => 'manager',
                'primary_role' => 'manager',
            ],
            [
                'email' => 'ana@alazharpeduli.or.id',
                'name' => 'Fitri Ana Wulandari',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'risda@alazharpeduli.or.id',
                'name' => 'Risdawati',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'fauzi@alazharpeduli.or.id',
                'name' => 'Fauzi Arif Suhada',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'rosyadi@alazharpeduli.or.id',
                'name' => 'Rosyadi',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'nopen@alazharpeduli.or.id',
                'name' => 'Nopen Setiawan',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
            [
                'email' => 'nadhila@alazharpeduli.or.id',
                'name' => 'Nadhilah Amalia Sifa',
                'password' => bcrypt('password'),
                'role' => 'creator',
                'primary_role' => 'creator',
            ],
        ];

        foreach ($accounts as $acc) {
            User::updateOrCreate(['email' => $acc['email']], $acc);
        }
    }
}
