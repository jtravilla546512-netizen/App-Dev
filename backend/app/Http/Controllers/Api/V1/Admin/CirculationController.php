<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookCopyResource;
use App\Http\Resources\BorrowRequestResource;
use App\Http\Resources\LoanResource;
use App\Http\Resources\UserResource;
use App\Models\BookCopy;
use App\Models\Loan;
use App\Models\User;
use App\Services\BorrowingEligibilityService;
use App\Services\CirculationService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class CirculationController extends Controller
{
    public function member(Request $request, BorrowingEligibilityService $eligibility)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:120']]);
        $member = User::query()->where('role', 'user')->where(function ($query) use ($data) {
            $query->where('library_card_code', trim($data['code']))->orWhere('member_id', trim($data['code']));
        })->firstOrFail();

        return ApiResponse::success([
            'member' => UserResource::make($member)->resolve($request),
            'eligibility' => $eligibility->check($member),
        ]);
    }

    public function copy(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:120']]);
        $copy = BookCopy::query()->with('book')->where(function ($query) use ($data) {
            $query->where('qr_code', trim($data['code']))->orWhere('accession_number', trim($data['code']));
        })->firstOrFail();
        $loan = Loan::query()->with('user', 'bookCopy.book.category', 'issuer', 'receiver')
            ->where('book_copy_id', $copy->id)->whereNull('returned_at')->first();

        return ApiResponse::success([
            'copy' => BookCopyResource::make($copy)->resolve($request),
            'title' => $copy->book->title,
            'loan' => $loan ? LoanResource::make($loan)->resolve($request) : null,
        ]);
    }

    public function borrow(Request $request, CirculationService $service)
    {
        $data = $request->validate([
            'member_id' => ['required', 'integer', 'exists:users,id'],
            'copy_id' => ['required', 'integer', 'exists:book_copies,id'],
            'due_at' => ['required', 'date', 'after:now'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $result = $service->borrow(User::findOrFail($data['member_id']), BookCopy::findOrFail($data['copy_id']), $data, $request->user());

        return ApiResponse::success(BorrowRequestResource::make($result)->resolve($request), 'Book issued successfully.', 201);
    }

    public function recordReturn(Request $request, CirculationService $service)
    {
        $data = $request->validate([
            'member_id' => ['required', 'integer', 'exists:users,id'],
            'copy_id' => ['required', 'integer', 'exists:book_copies,id'],
            'loan_id' => ['required', 'integer', 'exists:loans,id'],
            'return_condition' => ['required', 'in:good,damaged'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $result = $service->returnCopy(User::findOrFail($data['member_id']), BookCopy::findOrFail($data['copy_id']), $data, $request->user());

        return ApiResponse::success(LoanResource::make($result)->resolve($request), 'Return recorded successfully.');
    }
}
