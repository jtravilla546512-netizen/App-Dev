<?php

namespace Tests\Feature\Api;

use App\Models\Book;
use App\Models\BookCopy;
use App\Models\Loan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmartCirculationTest extends TestCase
{
    use RefreshDatabase;

    private function copy(): BookCopy
    {
        return BookCopy::factory()->for(Book::factory())->create(['status' => 'available']);
    }

    private function issue(User $member, BookCopy $copy): Loan
    {
        $this->postJson('/api/v1/admin/circulation/borrow', [
            'member_id' => $member->id, 'copy_id' => $copy->id,
            'due_at' => now()->addDays(7)->toISOString(),
        ])->assertCreated();

        return Loan::query()->where('book_copy_id', $copy->id)->latest('id')->firstOrFail();
    }

    public function test_qr_and_manual_lookup_are_admin_only_and_do_not_issue_books(): void
    {
        $member = User::factory()->create();
        $copy = $this->copy();
        Sanctum::actingAs($member);
        $this->getJson('/api/v1/admin/circulation/member?code='.$member->library_card_code)->assertForbidden();
        Sanctum::actingAs(User::factory()->admin()->create());
        foreach ([$member->library_card_code, $member->member_id] as $code) {
            $this->getJson('/api/v1/admin/circulation/member?code='.urlencode($code))->assertOk()->assertJsonPath('data.member.id', $member->id);
        }
        foreach ([$copy->qr_code, $copy->accession_number] as $code) {
            $this->getJson('/api/v1/admin/circulation/copy?code='.urlencode($code))->assertOk()->assertJsonPath('data.copy.id', $copy->id);
        }
        $this->getJson('/api/v1/admin/circulation/copy?code=unknown')->assertNotFound();
        $this->assertDatabaseCount('loans', 0);
    }

    public function test_borrow_and_return_are_atomic_with_wrong_member_and_duplicate_guards(): void
    {
        $member = User::factory()->create();
        $other = User::factory()->create();
        $copy = $this->copy();
        Sanctum::actingAs(User::factory()->admin()->create());
        $loan = $this->issue($member, $copy);
        $this->postJson('/api/v1/admin/circulation/borrow', ['member_id' => $other->id, 'copy_id' => $copy->id, 'due_at' => now()->addDay()->toISOString()])->assertConflict();
        $this->assertDatabaseCount('loans', 1);
        $payload = ['member_id' => $member->id, 'copy_id' => $copy->id, 'loan_id' => $loan->id, 'return_condition' => 'damaged'];
        $this->postJson('/api/v1/admin/circulation/return', array_replace($payload, ['member_id' => $other->id]))->assertConflict();
        $this->postJson('/api/v1/admin/circulation/return', $payload)->assertOk()->assertJsonPath('data.status', 'returned');
        $this->postJson('/api/v1/admin/circulation/return', $payload)->assertConflict();
        $this->assertDatabaseHas('book_copies', ['id' => $copy->id, 'status' => 'damaged']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'circulation.return_confirmed']);
    }

    public function test_overdue_dates_block_requests_and_approval_before_scheduler_runs_and_return_restores_access(): void
    {
        $admin = User::factory()->admin()->create();
        $member = User::factory()->create();
        $copy = $this->copy();
        $next = $this->copy();
        Sanctum::actingAs($admin);
        $loan = $this->issue($member, $copy);
        Sanctum::actingAs($member);
        $pending = $this->postJson('/api/v1/borrow-requests', ['book_id' => $next->book_id])->assertCreated()->json('data.id');
        $loan->update(['due_at' => now()->subMinute()]);
        $this->getJson('/api/v1/borrowing-eligibility')->assertOk()->assertJsonPath('data.can_borrow', false)->assertJsonPath('data.overdue_count', 1);
        $this->postJson('/api/v1/borrow-requests', ['book_id' => $this->copy()->book_id])->assertConflict();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/borrow-requests/{$pending}/approve")->assertConflict();
        $this->postJson('/api/v1/admin/circulation/borrow', ['member_id' => $member->id, 'copy_id' => $next->id, 'due_at' => now()->addDay()->toISOString()])->assertConflict();
        $this->postJson('/api/v1/admin/circulation/return', ['member_id' => $member->id, 'copy_id' => $copy->id, 'loan_id' => $loan->id, 'return_condition' => 'good'])->assertOk();
        $this->issue($member, $next);
    }

    public function test_due_today_reminder_is_separate_and_idempotent(): void
    {
        $this->travelTo(now()->startOfDay()->addHours(9));
        $member = User::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create());
        $loan = $this->issue($member, $this->copy());
        $member->notifications()->delete();
        $loan->update(['due_at' => now()->addDays(2)->endOfDay()]);
        $this->artisan('library:sync-loans')->assertSuccessful();
        $loan->update(['due_at' => now()->endOfDay()]);
        $this->artisan('library:sync-loans')->assertSuccessful();
        $this->artisan('library:sync-loans')->assertSuccessful();
        $this->assertSame(1, $member->notifications()->where('data->type', 'loan_due_today')->count());
        $this->assertSame(1, $member->notifications()->where('data->type', 'loan_due_soon')->count());
    }
}
